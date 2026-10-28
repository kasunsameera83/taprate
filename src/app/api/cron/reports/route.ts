import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { createPurposeToken } from "@/lib/security/signing";
import { sendEmail } from "@/lib/email";
import { loadPeriod } from "@/lib/insights/data";
import { generateInsight } from "@/lib/insights/generate";
import { buildReportEmail, periodLabel, reportDue, UNSUB_PURPOSE } from "@/lib/insights/reportEmail";
import type { InsightResult } from "@/lib/insights/ai";
import { sendAgentWins } from "@/lib/insights/wins";

// Daily job: sends weekly reports on Mondays and monthly reports on the 1st (Sri Lanka time).
// Needs "Authorization: Bearer <CRON_SECRET>". Before each email it re-checks that the person is still
// on the team with a role that may see business-wide numbers, and that the business isn't suspended.
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const MAX_PER_RUN = 300;

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
  const now = Date.now();
  const { data: subs, error } = await db
    .from("report_subscriptions")
    .select("id, account_id, user_id, frequency, survey_id, include_ai, last_sent_at")
    .order("last_sent_at", { ascending: true, nullsFirst: true })
    .limit(2000);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  const due = (subs ?? []).filter((s) => reportDue(s.frequency as "weekly" | "monthly", s.last_sent_at, now)).slice(0, MAX_PER_RUN);
  const aiCache = new Map<string, InsightResult | null>();
  let sent = 0;
  let skipped = 0;

  for (const s of due) {
    // Still allowed? (membership + role + business not suspended), and their email.
    const [{ data: m }, { data: acct }, { data: u }] = await Promise.all([
      db.from("memberships").select("role").eq("account_id", s.account_id).eq("user_id", s.user_id).maybeSingle(),
      db.from("accounts").select("name, suspended_at").eq("id", s.account_id).maybeSingle(),
      db.auth.admin.getUserById(s.user_id),
    ]);
    const email = u?.user?.email;
    if (!m || !["owner", "admin", "viewer"].includes(m.role) || !acct || acct.suspended_at || !email) {
      skipped++;
      continue;
    }
    const days = s.frequency === "weekly" ? 7 : 30;
    let surveyName: string | null = null;
    if (s.survey_id) {
      const { data: sv } = await db.from("surveys").select("name").eq("id", s.survey_id).eq("account_id", s.account_id).maybeSingle();
      surveyName = sv?.name ?? null;
    }
    const period = await loadPeriod(db, s.account_id, { surveyId: s.survey_id, days, now });
    const { count: overdue } = await db
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("account_id", s.account_id)
      .in("followup_status", ["open", "in_progress"])
      .lt("due_at", new Date(now).toISOString());

    // One AI summary per business/survey/period per run, shared by everyone who asked for it.
    let insight: InsightResult | null = null;
    if (s.include_ai) {
      const key = `${s.account_id}|${s.survey_id ?? ""}|${days}`;
      if (!aiCache.has(key)) {
        const r = await generateInsight(db, { accountId: s.account_id, surveyId: s.survey_id, surveyName, days, userId: null, now });
        aiCache.set(key, r.ok ? r.result : null);
      }
      insight = aiCache.get(key) ?? null;
    }

    const token = createPurposeToken(e.RESPONSE_TOKEN_SECRET, UNSUB_PURPOSE, s.id, 90 * 86400, Math.floor(now / 1000));
    const { subject, html } = buildReportEmail({
      businessName: acct.name,
      surveyName,
      frequency: s.frequency as "weekly" | "monthly",
      periodLabel: periodLabel(days, now),
      stats: period.stats,
      negativeComments: period.comments
        .filter((c) => c.sentiment === "negative")
        .slice(0, 5)
        .map((c) => ({ text: c.text.slice(0, 400), rating: c.rating, agent: c.agent })),
      overdueFollowups: overdue ?? 0,
      insight,
      appOrigin: e.appOrigin,
      unsubscribeUrl: `${e.appOrigin}/reports/unsubscribe?s=${s.id}&t=${encodeURIComponent(token)}`,
    });
    const result = await sendEmail({ to: email, subject, html });
    if (result === "sent") {
      sent++;
      await db.from("report_subscriptions").update({ last_sent_at: new Date(now).toISOString() }).eq("id", s.id);
    } else skipped++;
  }
  // Mondays: the weekly "wins" email to agents (for businesses that switched it on).
  const wins = await sendAgentWins(db, now);
  return NextResponse.json({ ok: true, due: due.length, sent, skipped, wins });
}
