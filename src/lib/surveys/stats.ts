// Report calculations. Pure, unit-tested. Only CONFIRMED ratings are passed in.
import { ICON_SETS, type IconSetId } from "./iconSets.ts";

export type StatRow = {
  rating: number;
  iconSet: IconSetId;
  createdAt: string; // ISO
  agent: string | null;
};

export type Stats = {
  total: number;
  positive: number;
  satisfactionPct: number | null; // share of "satisfied" ratings, 0-100
  nps: { score: number; promoters: number; passives: number; detractors: number; total: number } | null;
  byDay: Array<{ date: string; total: number; satisfactionPct: number }>;
  byAgent: Array<{ agent: string; total: number; satisfactionPct: number }>;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function isPositive(row: Pick<StatRow, "rating" | "iconSet">): boolean {
  return row.rating >= ICON_SETS[row.iconSet].positiveFrom;
}

export function computeStats(rows: readonly StatRow[], opts: { days?: number; now?: Date; maxAgents?: number } = {}): Stats {
  const days = opts.days ?? 30;
  const now = opts.now ?? new Date();
  const maxAgents = opts.maxAgents ?? 20;

  let positive = 0;
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  const dayMap = new Map<string, { total: number; positive: number }>();
  const agentMap = new Map<string, { total: number; positive: number }>();

  for (const r of rows) {
    const pos = isPositive(r);
    if (pos) positive++;

    if (r.iconSet === "nps") {
      if (r.rating >= 9) promoters++;
      else if (r.rating >= 7) passives++;
      else detractors++;
    }

    const day = r.createdAt.slice(0, 10);
    const d = dayMap.get(day) ?? { total: 0, positive: 0 };
    d.total++;
    if (pos) d.positive++;
    dayMap.set(day, d);

    if (r.agent) {
      const a = agentMap.get(r.agent) ?? { total: 0, positive: 0 };
      a.total++;
      if (pos) a.positive++;
      agentMap.set(r.agent, a);
    }
  }

  // Continuous day series (zero days included) so charts don't hide gaps.
  const byDay: Stats["byDay"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
    const d = dayMap.get(date);
    byDay.push({ date, total: d?.total ?? 0, satisfactionPct: d && d.total ? round1((d.positive / d.total) * 100) : 0 });
  }

  const byAgent = [...agentMap.entries()]
    .map(([agent, a]) => ({ agent, total: a.total, satisfactionPct: round1((a.positive / a.total) * 100) }))
    .sort((x, y) => y.total - x.total || y.satisfactionPct - x.satisfactionPct || x.agent.localeCompare(y.agent))
    .slice(0, maxAgents);

  const npsTotal = promoters + passives + detractors;
  return {
    total: rows.length,
    positive,
    satisfactionPct: rows.length ? round1((positive / rows.length) * 100) : null,
    nps: npsTotal
      ? { score: Math.round(((promoters - detractors) / npsTotal) * 100), promoters, passives, detractors, total: npsTotal }
      : null,
    byDay,
    byAgent,
  };
}
