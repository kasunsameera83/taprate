import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { statsQuerySchema } from "@/lib/validation/schemas";
import { computeStats, type StatRow } from "@/lib/surveys/stats";
import { isIconSetId } from "@/lib/surveys/iconSets";

const MAX_ROWS = 20_000;

export const GET = secureRoute<undefined, z.infer<typeof statsQuerySchema>>(
  { auth: "user", action: "stats:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: statsQuerySchema },
  async ({ supabase, membership, query }) => {
    const since = new Date(Date.now() - query.days * 24 * 3600 * 1000).toISOString();

    let q = supabase
      .from("responses")
      .select("rating, created_at, agent, surveys(icon_set)")
      .eq("account_id", membership.accountId)
      .eq("status", "confirmed")
      .gte("created_at", since);
    if (query.surveyId) q = q.eq("survey_id", query.surveyId);

    const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS);
    if (error) throw dbError(error);

    const rows: StatRow[] = [];
    for (const r of data as unknown as Array<{ rating: number | null; created_at: string; agent: string | null; surveys: { icon_set: string } | null }>) {
      const set = r.surveys?.icon_set;
      if (r.rating === null || !isIconSetId(set)) continue;
      rows.push({ rating: r.rating, iconSet: set, createdAt: r.created_at, agent: r.agent });
    }

    const [{ count: pending }, { data: account }] = await Promise.all([
      supabase.from("responses").select("id", { count: "exact", head: true }).eq("account_id", membership.accountId).eq("status", "pending"),
      supabase.from("accounts").select("name, plan, credit_balance").eq("id", membership.accountId).maybeSingle(),
    ]);

    return ok({
      ...computeStats(rows, { days: query.days }),
      pending: pending ?? 0,
      truncated: (data?.length ?? 0) >= MAX_ROWS,
      account: account ? { name: account.name, plan: account.plan, credits: account.credit_balance, role: membership.role } : null,
    });
  },
);
