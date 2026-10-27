// Report calculations. Pure, unit-tested. Only CONFIRMED ratings are passed in.
import { ICON_SETS, sentimentOf, type IconSetId, type Sentiment } from "./iconSets.ts";

export type StatRow = {
  rating: number;
  iconSet: IconSetId;
  createdAt: string; // ISO
  agent: string | null;
};

export type PeriodSummary = {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  satisfactionPct: number | null; // share of positive ratings, 0-100
  nps: { score: number; promoters: number; passives: number; detractors: number; total: number } | null;
};

export type Stats = PeriodSummary & {
  previous: PeriodSummary;
  byDay: Array<{ date: string; total: number; positive: number; neutral: number; negative: number }>;
  byAgent: Array<{ agent: string; total: number; satisfactionPct: number; negative: number }>;
  /** Most recent ratings, newest first, for the feedback stripe. */
  recent: Array<{ sentiment: Sentiment; createdAt: string }>;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function isPositive(row: Pick<StatRow, "rating" | "iconSet">): boolean {
  return row.rating >= ICON_SETS[row.iconSet].positiveFrom;
}

export function summarise(rows: readonly StatRow[]): PeriodSummary {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of rows) {
    counts[sentimentOf(r.iconSet, r.rating)]++;
    if (r.iconSet === "nps") {
      if (r.rating >= 9) promoters++;
      else if (r.rating >= 7) passives++;
      else detractors++;
    }
  }
  const npsTotal = promoters + passives + detractors;
  return {
    total: rows.length,
    ...counts,
    satisfactionPct: rows.length ? round1((counts.positive / rows.length) * 100) : null,
    nps: npsTotal
      ? { score: Math.round(((promoters - detractors) / npsTotal) * 100), promoters, passives, detractors, total: npsTotal }
      : null,
  };
}

/**
 * @param current  ratings inside the selected period
 * @param previous ratings in the equally long period just before it (for "vs previous" deltas)
 */
export function computeStats(
  current: readonly StatRow[],
  previous: readonly StatRow[],
  opts: { days?: number; now?: Date; maxAgents?: number; recent?: number } = {},
): Stats {
  const days = opts.days ?? 30;
  const now = opts.now ?? new Date();
  const maxAgents = opts.maxAgents ?? 20;
  const recentCount = opts.recent ?? 60;

  const dayMap = new Map<string, { total: number; positive: number; neutral: number; negative: number }>();
  const agentMap = new Map<string, { total: number; positive: number; negative: number }>();

  for (const r of current) {
    const s = sentimentOf(r.iconSet, r.rating);
    const day = r.createdAt.slice(0, 10);
    const d = dayMap.get(day) ?? { total: 0, positive: 0, neutral: 0, negative: 0 };
    d.total++;
    d[s]++;
    dayMap.set(day, d);

    if (r.agent) {
      const a = agentMap.get(r.agent) ?? { total: 0, positive: 0, negative: 0 };
      a.total++;
      if (s === "positive") a.positive++;
      if (s === "negative") a.negative++;
      agentMap.set(r.agent, a);
    }
  }

  // Continuous day series (zero days included) so charts don't hide gaps.
  const byDay: Stats["byDay"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
    byDay.push({ date, ...(dayMap.get(date) ?? { total: 0, positive: 0, neutral: 0, negative: 0 }) });
  }

  const byAgent = [...agentMap.entries()]
    .map(([agent, a]) => ({ agent, total: a.total, satisfactionPct: round1((a.positive / a.total) * 100), negative: a.negative }))
    .sort((x, y) => y.total - x.total || y.satisfactionPct - x.satisfactionPct || x.agent.localeCompare(y.agent))
    .slice(0, maxAgents);

  const recent = [...current]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, recentCount)
    .map((r) => ({ sentiment: sentimentOf(r.iconSet, r.rating), createdAt: r.createdAt }));

  return { ...summarise(current), previous: summarise(previous), byDay, byAgent, recent };
}
