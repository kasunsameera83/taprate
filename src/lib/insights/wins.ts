import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { createPurposeToken } from "@/lib/security/signing";
import { isIconSetId, sentimentOf } from "@/lib/surveys/iconSets";
import { colomboDate, periodLabel } from "@/lib/insights/reportEmail";
import { buildWinsEmail, WINS_UNSUB_PURPOSE } from "@/lib/insights/winsEmail";

const MAX_PER_RUN = 500;

/**
 * Mondays (Sri Lanka time): one email per agent, for businesses whose owner switched it on.
 * Re-checks the person is still an agent, hasn't opted out, wasn't emailed this week, and had ratings.
 */
export async function sendAgentWins(db: SupabaseClient, now = Date.now()): Promise<{ sent: number; skipped: number }> {
  if (colomboDate(now).weekday !== 1) return { sent: 0, skipped: 0 };
  const e = env();
  const { data: accounts } = await db.from("accounts").select("id, name").eq("agent_wins_enabled", true).is("suspended_at", null).limit(2000);
  let sent = 0;
  let skipped = 0;
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(now - 14 * 86_400_000).toISOString();

  for (const acct of accounts ?? []) {
    if (sent >= MAX_PER_RUN) break;
    const { data: agents } = await db
      .from("memberships")
      .select("user_id, agent_name, wins_last_sent_at")
      .eq("account_id", acct.id)
      .eq("role", "agent")
      .eq("wins_opt_out", false)
      .not("agent_name", "is", null);
    for (const m of agents ?? []) {
      if (sent >= MAX_PER_RUN) break;
      if (m.wins_last_sent_at && now - Date.parse(m.wins_last_sent_at) < 5 * 86_400_000) continue;
      const { data: rows } = await db
        .from("responses")
        .select("rating, comment, created_at, surveys(icon_set)")
        .eq("account_id", acct.id)
        .eq("agent", m.agent_name)
        .eq("status", "confirmed")
        .neq("channel", "import")
        .gte("created_at", twoWeeksAgo)
        .order("created_at", { ascending: false })
        .limit(2000);
      const list = ((rows ?? []) as unknown as Array<{ rating: number | null; comment: string | null; created_at: string; surveys: { icon_set: string } | null }>).filter(
        (r) => r.rating !== null && r.surveys && isIconSetId(r.surveys.icon_set),
      );
      const isPos = (r: (typeof list)[number]) => sentimentOf(r.surveys!.icon_set as never, r.rating!) === "positive";
      const cur = list.filter((r) => r.created_at >= weekAgo);
      const prev = list.filter((r) => r.created_at < weekAgo);
      if (cur.length === 0) {
        skipped++;
        continue;
      }
      const pct = (rs: typeof list) => (rs.length ? Math.round((rs.filter(isPos).length / rs.length) * 1000) / 10 : null);
      const { data: u } = await db.auth.admin.getUserById(m.user_id);
      const to = u?.user?.email;
      if (!to) {
        skipped++;
        continue;
      }
      const token = createPurposeToken(e.RESPONSE_TOKEN_SECRET, WINS_UNSUB_PURPOSE, m.user_id, 90 * 86400, Math.floor(now / 1000));
      const mail = buildWinsEmail({
        agentName: m.agent_name!,
        businessName: acct.name,
        periodLabel: periodLabel(7, now),
        total: cur.length,
        positive: cur.filter(isPos).length,
        satisfactionPct: pct(cur),
        previousPct: pct(prev),
        kindWords: cur.filter((r) => isPos(r) && r.comment).map((r) => r.comment!),
        appOrigin: e.appOrigin,
        unsubscribeUrl: `${e.appOrigin}/reports/unsubscribe?w=${m.user_id}&t=${encodeURIComponent(token)}`,
      });
      const r = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text });
      if (r === "sent") {
        sent++;
        await db.from("memberships").update({ wins_last_sent_at: new Date(now).toISOString() }).eq("account_id", acct.id).eq("user_id", m.user_id);
      } else skipped++;
    }
  }
  return { sent, skipped };
}
