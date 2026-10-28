import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { statsQuerySchema } from "@/lib/validation/schemas";
import { computeStats, type StatRow } from "@/lib/surveys/stats";
import { isIconSetId, sentimentOf, type IconSetId } from "@/lib/surveys/iconSets";

type Row = { rating: number | null; created_at: string; agent: string | null; drivers: string[] | null; location_id: string | null; surveys: { icon_set: string } | null };

/** Satisfaction per branch for the current period, compared with the previous one. */
function branchStats(rows: Array<{ row: Row; set: IconSetId; current: boolean }>, names: Map<string, string>) {
  const acc = new Map<string, { total: number; pos: number; neg: number; pTotal: number; pPos: number }>();
  for (const { row, set, current } of rows) {
    if (!row.location_id || row.rating === null) continue;
    const a = acc.get(row.location_id) ?? { total: 0, pos: 0, neg: 0, pTotal: 0, pPos: 0 };
    const s = sentimentOf(set, row.rating);
    if (current) {
      a.total++;
      if (s === "positive") a.pos++;
      if (s === "negative") a.neg++;
    } else {
      a.pTotal++;
      if (s === "positive") a.pPos++;
    }
    acc.set(row.location_id, a);
  }
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
  return [...names.entries()]
    .map(([id, name]) => {
      const a = acc.get(id) ?? { total: 0, pos: 0, neg: 0, pTotal: 0, pPos: 0 };
      return { id, name, total: a.total, satisfactionPct: pct(a.pos, a.total), previousPct: pct(a.pPos, a.pTotal), negative: a.neg };
    })
    .filter((b) => b.total > 0 || b.previousPct !== null)
    .sort((x, y) => y.total - x.total);
}

const MAX_ROWS = 20_000;

export const GET = secureRoute<undefined, z.infer<typeof statsQuerySchema>>(
  { auth: "user", action: "stats:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: statsQuerySchema },
  async ({ supabase, membership, query }) => {
    const periodMs = query.days * 24 * 3600 * 1000;
    const now = Date.now();
    const since = new Date(now - periodMs).toISOString();
    const previousSince = new Date(now - 2 * periodMs).toISOString();

    // Current + previous period in one query (both explicitly scoped to this account; RLS also applies).
    let q = supabase
      .from("responses")
      .select("rating, created_at, agent, drivers, location_id, surveys(icon_set)")
      .eq("account_id", membership.accountId)
      .eq("status", "confirmed")
      .gte("created_at", previousSince);
    if (query.surveyId) q = q.eq("survey_id", query.surveyId);
    if (query.locationId) q = q.eq("location_id", query.locationId);

    const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS);
    if (error) throw dbError(error);

    const current: StatRow[] = [];
    const previous: StatRow[] = [];
    const tagged: Array<{ row: Row; set: IconSetId; current: boolean }> = [];
    for (const r of data as unknown as Row[]) {
      const set = r.surveys?.icon_set;
      if (r.rating === null || !isIconSetId(set)) continue;
      const row = { rating: r.rating, iconSet: set, createdAt: r.created_at, agent: r.agent, drivers: r.drivers ?? [] };
      const isCurrent = Date.parse(r.created_at) >= now - periodMs;
      (isCurrent ? current : previous).push(row);
      if (r.location_id) tagged.push({ row: r, set, current: isCurrent });
    }
    const { data: locs } = await supabase.from("locations").select("id, name").eq("account_id", membership.accountId).limit(500);
    const names = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));

    let pendingQ = supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("account_id", membership.accountId)
      .eq("status", "pending")
      .gte("created_at", since);
    if (query.surveyId) pendingQ = pendingQ.eq("survey_id", query.surveyId);
    if (query.locationId) pendingQ = pendingQ.eq("location_id", query.locationId);

    const [{ count: pending }, { data: account }] = await Promise.all([
      pendingQ,
      supabase.from("accounts").select("name, plan, credit_balance").eq("id", membership.accountId).maybeSingle(),
    ]);

    return ok({
      ...computeStats(current, previous, { days: query.days }),
      byLocation: branchStats(tagged, names),
      pending: pending ?? 0,
      truncated: (data?.length ?? 0) >= MAX_ROWS,
      account: account ? { name: account.name, plan: account.plan, credits: account.credit_balance, role: membership.role } : null,
    });
  },
);
