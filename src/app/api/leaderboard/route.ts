import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { leaderboardQuerySchema } from "@/lib/validation/schemas";
import { leaderboard, type StatRow } from "@/lib/surveys/stats";
import { isIconSetId } from "@/lib/surveys/iconSets";

const MAX_ROWS = 20_000;

// Agents ranked by satisfaction. Agents only see their own row (RLS limits their ratings).
export const GET = secureRoute<undefined, z.infer<typeof leaderboardQuerySchema>>(
  { auth: "user", action: "stats:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: leaderboardQuerySchema },
  async ({ supabase, membership, query }) => {
    const periodMs = query.days * 24 * 3600 * 1000;
    const now = Date.now();
    let q = supabase
      .from("responses")
      .select("rating, created_at, agent, surveys(icon_set)")
      .eq("account_id", membership.accountId)
      .eq("status", "confirmed")
      .not("agent", "is", null)
      .gte("created_at", new Date(now - 2 * periodMs).toISOString());
    if (query.surveyId) q = q.eq("survey_id", query.surveyId);
    const { data, error } = await q.limit(MAX_ROWS);
    if (error) throw dbError(error);

    const current: StatRow[] = [];
    const previous: StatRow[] = [];
    for (const r of data as unknown as Array<{ rating: number | null; created_at: string; agent: string | null; surveys: { icon_set: string } | null }>) {
      const set = r.surveys?.icon_set;
      if (r.rating === null || !isIconSetId(set)) continue;
      const row = { rating: r.rating, iconSet: set, createdAt: r.created_at, agent: r.agent };
      (Date.parse(r.created_at) >= now - periodMs ? current : previous).push(row);
    }
    return ok({ ...leaderboard(current, previous, query.minRatings), minRatings: query.minRatings, truncated: (data?.length ?? 0) >= MAX_ROWS });
  },
);
