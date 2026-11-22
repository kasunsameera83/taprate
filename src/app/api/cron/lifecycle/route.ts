import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { createPurposeToken } from "@/lib/security/signing";
import { sendEmail } from "@/lib/email";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { formatMoney } from "@/lib/billing/catalog";
import { isPaidPlan } from "@/lib/billing/features";
import { buildLifecycleEmail, pickLifecycleEmail, TIPS_UNSUB_PURPOSE, type LifecycleKind } from "@/lib/lifecycle/emails";

// Hourly: the welcome emails for businesses in their first 30 days (setup nudge, first rating, week one).
// Each kind is claimed in lifecycle_emails before sending, so it goes out at most once even if two runs
// overlap; if every send fails, the claim is released and the next run tries again. Owners who clicked
// "Stop these emails" (memberships.tips_opt_out) are skipped. Needs "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_EMAILS_PER_RUN = 200;

function authorized(req: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Row = {
  account_id: string; name: string | null; plan: string | null; local_languages: boolean | null; created_at: string;
  surveys: number; ratings: number; ratings_7d: number; happy_7d: number; unhappy_7d: number; sent: string[] | null;
};

export async function GET(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.cron, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return NextResponse.json({ ok: false }, { status: 429 });
  if (!e.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(req, e.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db.rpc("lifecycle_candidates", { p_limit: 1000 });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  const now = Date.now();
  const catalog = await loadCatalog();
  const cheapest = (cur: "LKR" | "USD") => [...catalog.plans].filter((p) => p.active).sort((a, b) => a.price[cur].month - b.price[cur].month)[0];

  let emailed = 0;
  for (const c of (data ?? []) as Row[]) {
    if (emailed >= MAX_EMAILS_PER_RUN) break;
    const kind: LifecycleKind | null = pickLifecycleEmail(
      { createdAt: c.created_at, surveys: Number(c.surveys), ratings: Number(c.ratings), sent: c.sent ?? [] },
      now,
    );
    if (!kind) continue;

    // Claim it first: if another run already did, the insert does nothing and we skip.
    const { data: claimed } = await db.from("lifecycle_emails").upsert({ account_id: c.account_id, kind }, { onConflict: "account_id,kind", ignoreDuplicates: true }).select("kind");
    if (!claimed || claimed.length === 0) continue;

    const { data: owners } = await db.from("memberships").select("user_id, tips_opt_out").eq("account_id", c.account_id).eq("role", "owner").limit(5);
    const cur = c.local_languages ? "LKR" : "USD";
    const plan = cheapest(cur);
    const offer = !isPaidPlan(c.plan ?? "") && plan ? { name: plan.name, price: formatMoney(plan.price[cur].month, cur), responses: plan.monthlyResponses } : null;

    let anySent = false;
    let anyFailed = false;
    for (const o of owners ?? []) {
      if (o.tips_opt_out) continue;
      const { data: u } = await db.auth.admin.getUserById(o.user_id as string);
      const to = u?.user?.email;
      if (!to || !u?.user?.email_confirmed_at) continue;
      const token = createPurposeToken(e.RESPONSE_TOKEN_SECRET, TIPS_UNSUB_PURPOSE, o.user_id as string, 90 * 86400, Math.floor(now / 1000));
      const unsubscribeUrl = `${e.appOrigin}/reports/unsubscribe?tip=${o.user_id}&t=${encodeURIComponent(token)}`;
      const mail = buildLifecycleEmail(kind, {
        businessName: String(c.name ?? ""),
        ratings7d: Number(c.ratings_7d),
        happy7d: Number(c.happy_7d),
        unhappy7d: Number(c.unhappy_7d),
        offer,
        appOrigin: e.appOrigin,
        unsubscribeUrl,
      });
      const r = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } });
      if (r === "sent") anySent = true;
      else if (r === "failed") anyFailed = true;
    }
    if (anySent) emailed++;
    // Every send failed: release the claim so the next hourly run tries again.
    else if (anyFailed) await db.from("lifecycle_emails").delete().eq("account_id", c.account_id).eq("kind", kind);
  }
  return NextResponse.json({ ok: true, checked: data?.length ?? 0, emailed });
}
