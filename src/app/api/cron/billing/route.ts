import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { sendEmail } from "@/lib/email";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { buildPlanEmail, RENEW_REMINDER_DAYS } from "@/lib/billing/planEmails";

// Daily:
//  1. Plans cancelled with PayHere (which just stops charging) end once the paid period is over.
//  2. Prepaid plans (one-off payments, 0040) end once their paid period is over; the owner is told.
//  3. Owners of prepaid plans ending in the next few days get one reminder to renew.
// (Stripe tells us itself when a cancelled plan ends.) Needs "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Db = ReturnType<typeof adminClient>;

/** Confirmed email addresses of a business's owners. */
async function ownerEmails(db: Db, accountId: string): Promise<string[]> {
  const { data: owners } = await db.from("memberships").select("user_id").eq("account_id", accountId).eq("role", "owner").limit(5);
  const out: string[] = [];
  for (const o of owners ?? []) {
    const { data: u } = await db.auth.admin.getUserById(o.user_id as string);
    if (u?.user?.email && u.user.email_confirmed_at) out.push(u.user.email);
  }
  return out;
}

async function tellOwners(db: Db, accountId: string, kind: "ending" | "ended", planName: string, endsAt: string, appOrigin: string): Promise<"sent" | "failed" | "none"> {
  const { data: acct } = await db.from("accounts").select("name, suspended_at").eq("id", accountId).maybeSingle();
  if (!acct || acct.suspended_at) return "none";
  const emails = await ownerEmails(db, accountId);
  if (emails.length === 0) return "none";
  const msg = buildPlanEmail({ kind, businessName: String(acct.name ?? ""), planName, endsAt, appOrigin });
  let sent = false;
  for (const to of emails) if ((await sendEmail({ to, ...msg })) === "sent") sent = true;
  return sent ? "sent" : "failed";
}

export async function GET(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.cron, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return NextResponse.json({ ok: false }, { status: 429 });
  if (!e.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(req, e.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });

  const db = adminClient();
  const now = new Date();
  const cutoff = now.toISOString();
  const planName = new Map((await loadCatalog()).plans.map((p) => [p.id as string, p.name]));

  // 1 + 2: periods that are over.
  const [{ data: cancelled, error: e1 }, { data: prepaidOver, error: e2 }] = await Promise.all([
    db
      .from("subscriptions")
      .select("provider, provider_sub_id")
      .eq("provider", "payhere")
      .eq("status", "cancelled")
      .or(`current_period_end.is.null,current_period_end.lt.${cutoff}`)
      .limit(500),
    db.from("subscriptions").select("account_id, provider, provider_sub_id, plan, current_period_end").eq("prepaid", true).eq("status", "active").lt("current_period_end", cutoff).limit(500),
  ]);
  if (e1 || e2) return NextResponse.json({ ok: false }, { status: 500 });
  let ended = 0;
  for (const s of cancelled ?? []) {
    const { error: uErr } = await db.rpc("billing_subscription_update", { p_provider: s.provider, p_sub_ref: s.provider_sub_id, p_status: "ended", p_cancel_at_period_end: null, p_period_end: null });
    if (!uErr) ended++;
  }
  let prepaidEnded = 0;
  for (const s of prepaidOver ?? []) {
    const { data, error: uErr } = await db.rpc("billing_subscription_update", { p_provider: s.provider, p_sub_ref: s.provider_sub_id, p_status: "ended", p_cancel_at_period_end: null, p_period_end: null });
    if (uErr || data !== "updated") continue;
    prepaidEnded++;
    await tellOwners(db, s.account_id as string, "ended", planName.get(s.plan as string) ?? "paid", s.current_period_end as string, e.appOrigin);
  }

  // 3: one reminder before a prepaid plan ends.
  const soon = new Date(now.getTime() + RENEW_REMINDER_DAYS * 86400_000).toISOString();
  const { data: ending } = await db
    .from("subscriptions")
    .select("id, account_id, plan, current_period_end")
    .eq("prepaid", true)
    .eq("status", "active")
    .is("reminder_sent_at", null)
    .gte("current_period_end", cutoff)
    .lte("current_period_end", soon)
    .limit(500);
  let reminded = 0;
  for (const s of ending ?? []) {
    const r = await tellOwners(db, s.account_id as string, "ending", planName.get(s.plan as string) ?? "paid", s.current_period_end as string, e.appOrigin);
    if (r === "failed") continue; // try again tomorrow
    await db.from("subscriptions").update({ reminder_sent_at: cutoff }).eq("id", s.id).is("reminder_sent_at", null);
    if (r === "sent") reminded++;
  }
  return NextResponse.json({ ok: true, ended, prepaidEnded, reminded });
}
