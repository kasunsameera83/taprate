import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { sendEmail } from "@/lib/email";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { allowanceFor, buildCreditsEmail, creditLevel } from "@/lib/billing/credits";
import { isPaidPlan } from "@/lib/billing/features";

// Hourly: emails owners once when their business is running low on responses, and once when it runs out.
// credit_alert_level (0039) remembers what was sent and drops back after they add responses, so the next
// dip emails again. Needs "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const MAX_EMAILS_PER_RUN = 200;

function authorized(req: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.cron, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return NextResponse.json({ ok: false }, { status: 429 });
  if (!e.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(req, e.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });

  const db = adminClient();
  const catalog = await loadCatalog();
  // Anyone who could be low (the biggest plan's low mark is 2,000) or was emailed before.
  const { data: accounts, error } = await db
    .from("accounts")
    .select("id, name, plan, credit_balance, credit_alert_level, suspended_at")
    .or("credit_balance.lte.2000,credit_alert_level.gt.0")
    .limit(5000);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  let emailed = 0;
  let reset = 0;
  for (const a of accounts ?? []) {
    const level = creditLevel(Number(a.credit_balance ?? 0), allowanceFor(a.plan as string, catalog));
    const stored = Number(a.credit_alert_level ?? 0);
    if (level < stored) {
      // They added responses: allow the next dip to email again.
      await db.from("accounts").update({ credit_alert_level: level }).eq("id", a.id);
      reset++;
      continue;
    }
    if (level === stored || level === 0 || a.suspended_at || emailed >= MAX_EMAILS_PER_RUN) continue;

    const { data: owners } = await db.from("memberships").select("user_id").eq("account_id", a.id).eq("role", "owner").limit(5);
    const { subject, html, text } = buildCreditsEmail({
      businessName: String(a.name ?? ""),
      level: level as 1 | 2,
      balance: Math.max(0, Number(a.credit_balance ?? 0)),
      paid: isPaidPlan(a.plan as string),
      appOrigin: e.appOrigin,
    });
    let anySent = false;
    let anyFailed = false;
    for (const o of owners ?? []) {
      const { data: u } = await db.auth.admin.getUserById(o.user_id as string);
      const to = u?.user?.email;
      if (!to || !u?.user?.email_confirmed_at) continue;
      const r = await sendEmail({ to, subject, html, text });
      if (r === "sent") anySent = true;
      else if (r === "failed") anyFailed = true;
    }
    // Failed sends are retried next hour; otherwise (sent, or no one to send to) mark it done.
    if (anySent || !anyFailed) {
      await db.from("accounts").update({ credit_alert_level: level }).eq("id", a.id);
      if (anySent) emailed++;
    }
  }
  return NextResponse.json({ ok: true, checked: accounts?.length ?? 0, emailed, reset });
}
