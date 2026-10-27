// Report calculations. Pure, unit-tested. Only CONFIRMED ratings are passed in.
import { ICON_SETS, sentimentOf, type IconSetId, type Sentiment } from "./iconSets.ts";

export type StatRow = {
  rating: number;
  iconSet: IconSetId;
  createdAt: string; // ISO
  agent: string | null;
  drivers?: readonly string[];
};

export type PeriodSummary = {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  satisfactionPct: number | null; // share of positive ratings, 0-100
  nps: { score: number; promoters: number; passives: number; detractors: number; total: number } | null;
  /** Customer effort: average on the 1-7 scale (higher = easier). */
  ces: { average: number; total: number } | null;
};

export type Stats = PeriodSummary & {
  previous: PeriodSummary;
  byDay: Array<{ date: string; total: number; positive: number; neutral: number; negative: number }>;
  byAgent: Array<{ agent: string; total: number; satisfactionPct: number; negative: number }>;
  /** Most recent ratings, newest first, for the feedback stripe. */
  recent: Array<{ sentiment: Sentiment; createdAt: string }>;
  /** Most-picked reasons, split by what went well vs what could be better. */
  drivers: { positive: Array<{ label: string; count: number }>; negative: Array<{ label: string; count: number }> };
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
  let cesSum = 0;
  let cesCount = 0;
  for (const r of rows) {
    if (r.iconSet === "ces") {
      cesSum += r.rating;
      cesCount++;
    }
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
    ces: cesCount ? { average: Math.round((cesSum / cesCount) * 10) / 10, total: cesCount } : null,
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
  const driverPos = new Map<string, number>();
  const driverNeg = new Map<string, number>();
  const agentMap = new Map<string, { total: number; positive: number; negative: number }>();

  for (const r of current) {
    const s = sentimentOf(r.iconSet, r.rating);
    for (const d of r.drivers ?? []) {
      const m = s === "positive" ? driverPos : driverNeg;
      m.set(d, (m.get(d) ?? 0) + 1);
    }
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

  const top = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 8);

  return { ...summarise(current), previous: summarise(previous), byDay, byAgent, recent, drivers: { positive: top(driverPos), negative: top(driverNeg) } };
}

export type LeaderboardRow = {
  agent: string;
  total: number;
  satisfactionPct: number;
  negative: number;
  previousSatisfactionPct: number | null;
};

/**
 * Agents ranked by satisfaction. Agents with fewer than `minRatings` ratings are listed separately
 * so one lucky 5-star rating can't top the board.
 */
export function leaderboard(current: readonly StatRow[], previous: readonly StatRow[], minRatings = 5): { ranked: LeaderboardRow[]; tooFew: LeaderboardRow[] } {
  const tally = (rows: readonly StatRow[]) => {
    const m = new Map<string, { name: string; total: number; positive: number; negative: number }>();
    for (const r of rows) {
      if (!r.agent) continue;
      const key = r.agent.toLowerCase();
      const t = m.get(key) ?? { name: r.agent, total: 0, positive: 0, negative: 0 };
      const s = sentimentOf(r.iconSet, r.rating);
      t.total++;
      if (s === "positive") t.positive++;
      if (s === "negative") t.negative++;
      m.set(key, t);
    }
    return m;
  };
  const now = tally(current);
  const before = tally(previous);
  const rows: LeaderboardRow[] = [...now.entries()].map(([key, t]) => {
    const p = before.get(key);
    return {
      agent: t.name,
      total: t.total,
      satisfactionPct: round1((t.positive / t.total) * 100),
      negative: t.negative,
      previousSatisfactionPct: p && p.total ? round1((p.positive / p.total) * 100) : null,
    };
  });
  const order = (a: LeaderboardRow, b: LeaderboardRow) => b.satisfactionPct - a.satisfactionPct || b.total - a.total || a.agent.localeCompare(b.agent);
  return {
    ranked: rows.filter((r) => r.total >= minRatings).sort(order),
    tooFew: rows.filter((r) => r.total < minRatings).sort(order),
  };
}
