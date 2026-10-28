import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStats, type Stats, type StatRow } from "@/lib/surveys/stats";
import { ICON_SETS, isIconSetId, ratingOption, sentimentOf } from "@/lib/surveys/iconSets";
import type { CommentInput } from "@/lib/insights/ai";

const MAX_ROWS = 20_000;
const MAX_COMMENTS = 300;

export type PeriodData = {
  stats: Stats;
  comments: Array<CommentInput & { createdAt: string; agent: string | null }>;
  totalComments: number;
  truncated: boolean;
};

/**
 * Ratings and comments for one period (and the period before it, for comparisons).
 * Works with the user's own client (database permissions apply) or the service client (cron),
 * and ALWAYS filters by account explicitly.
 */
export async function loadPeriod(db: SupabaseClient, accountId: string, opts: { surveyId?: string | null; days: number; now?: number }): Promise<PeriodData> {
  const now = opts.now ?? Date.now();
  const periodMs = opts.days * 86_400_000;
  let q = db
    .from("responses")
    .select("rating, created_at, agent, drivers, comment, sentiment, surveys(icon_set)")
    .eq("account_id", accountId)
    .eq("status", "confirmed")
    .gte("created_at", new Date(now - 2 * periodMs).toISOString())
    .lte("created_at", new Date(now).toISOString());
  if (opts.surveyId) q = q.eq("survey_id", opts.surveyId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS);
  if (error) throw new Error("could not load ratings");

  const current: StatRow[] = [];
  const previous: StatRow[] = [];
  const comments: PeriodData["comments"] = [];
  let totalComments = 0;
  for (const r of (data ?? []) as unknown as Array<{ rating: number | null; created_at: string; agent: string | null; drivers: string[] | null; comment: string | null; surveys: { icon_set: string } | null }>) {
    const set = r.surveys?.icon_set;
    if (r.rating === null || !isIconSetId(set)) continue;
    const row = { rating: r.rating, iconSet: set, createdAt: r.created_at, agent: r.agent, drivers: r.drivers ?? [] };
    const inCurrent = Date.parse(r.created_at) >= now - periodMs;
    (inCurrent ? current : previous).push(row);
    if (inCurrent && r.comment) {
      totalComments++;
      if (comments.length < MAX_COMMENTS) {
        comments.push({
          text: r.comment.slice(0, 600),
          sentiment: sentimentOf(set, r.rating),
          rating: `${ratingOption(set, r.rating)?.label ?? r.rating} (${r.rating} of ${ICON_SETS[set].max})`,
          reasons: r.drivers ?? [],
          createdAt: r.created_at,
          agent: r.agent,
        });
      }
    }
  }
  return { stats: computeStats(current, previous, { days: opts.days, now: new Date(now) }), comments, totalComments, truncated: (data?.length ?? 0) >= MAX_ROWS };
}
