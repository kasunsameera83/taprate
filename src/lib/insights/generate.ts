import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { loadPeriod, type PeriodData } from "@/lib/insights/data";
import { INSIGHT_SYSTEM_PROMPT, askClaude, buildInsightPrompt, parseInsightAnswer, type InsightResult } from "@/lib/insights/ai";
import { planAllows } from "@/lib/billing/features";

export const MIN_COMMENTS = 3;

export type GenerateOutcome =
  | { ok: true; id: string; createdAt: string; result: InsightResult; period: PeriodData }
  | { ok: false; code: "not_configured" | "disabled" | "too_few" | "rate_limited" | "busy" | "failed"; count?: number };

/**
 * Makes and saves one AI summary. The caller has already checked who's asking; this checks the business
 * has AI switched on, there's enough to summarise, and the daily limit. `db` must be able to read the
 * account's ratings (the user's client, or the service client in the scheduled job).
 */
export async function generateInsight(db: SupabaseClient, args: { accountId: string; surveyId: string | null; surveyName: string | null; days: 7 | 30 | 90; userId: string | null; now?: number }): Promise<GenerateOutcome> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) return { ok: false, code: "not_configured" };
  const { data: acct } = await adminClient().from("accounts").select("name, ai_insights_enabled, plan").eq("id", args.accountId).maybeSingle();
  // AI is a paid feature (0031): an account that dropped to free behaves as if AI were off.
  if (!acct?.ai_insights_enabled || !planAllows(acct.plan as string, "ai")) return { ok: false, code: "disabled" };

  const now = args.now ?? Date.now();
  const period = await loadPeriod(db, args.accountId, { surveyId: args.surveyId, days: args.days, now });
  if (period.comments.length < MIN_COMMENTS) return { ok: false, code: "too_few", count: period.comments.length };
  if (!(await hitRateLimit(LIMITS.aiPerAccount, args.accountId))) return { ok: false, code: "rate_limited" };

  const prompt = buildInsightPrompt({
    businessName: acct.name,
    surveyName: args.surveyName,
    days: args.days,
    stats: period.stats,
    topReasons: { positive: period.stats.drivers.positive.slice(0, 5).map((d) => d.label), negative: period.stats.drivers.negative.slice(0, 5).map((d) => d.label) },
    comments: period.comments,
  });
  const answer = await askClaude({ apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL, system: INSIGHT_SYSTEM_PROMPT, prompt });
  if (!answer.ok) return { ok: false, code: answer.reason === "busy" ? "busy" : "failed" };
  const result = parseInsightAnswer(answer.text, period.comments);
  if (!result) return { ok: false, code: "failed" };

  const { data: saved, error } = await adminClient()
    .from("insights")
    .insert({
      account_id: args.accountId,
      survey_id: args.surveyId,
      period_days: args.days,
      period_start: new Date(now - args.days * 86_400_000).toISOString(),
      period_end: new Date(now).toISOString(),
      comment_count: period.totalComments,
      rating_count: period.stats.total,
      result,
      model: e.ANTHROPIC_MODEL,
      created_by: args.userId,
    })
    .select("id, created_at")
    .single();
  if (error || !saved) return { ok: false, code: "failed" };
  return { ok: true, id: saved.id as string, createdAt: saved.created_at as string, result, period };
}
