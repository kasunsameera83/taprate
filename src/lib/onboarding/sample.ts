// Believable sample numbers for a brand-new account, so people can see what TapTruly will show before
// their first real rating. Pure and deterministic (same picture every time); never saved anywhere.
import { computeStats, type StatRow } from "../surveys/stats.ts";

const AGENTS = ["Nimal", "Amaya", "Ruwan", "Fathima"];
const GOOD = ["Fast reply", "Friendly", "Solved my problem"];
const BAD = ["Slow reply", "Not solved"];

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

function rows(days: number, from: number, seed: number, quality: number): StatRow[] {
  const r = rng(seed);
  const out: StatRow[] = [];
  for (let d = 0; d < days; d++) {
    const n = 6 + Math.floor(r() * 9);
    for (let i = 0; i < n; i++) {
      const p = r();
      const rating = p < quality ? 5 : p < quality + 0.08 ? 4 : p < quality + 0.14 ? 3 : p < quality + 0.18 ? 2 : 1;
      const t = from - d * 86_400_000 - Math.floor(r() * 80_000_000);
      out.push({
        rating,
        iconSet: "faces5",
        createdAt: new Date(t).toISOString(),
        agent: AGENTS[Math.floor(r() * AGENTS.length)]!,
        drivers: rating >= 4 ? (r() < 0.6 ? [GOOD[Math.floor(r() * GOOD.length)]!] : []) : rating <= 2 ? [BAD[Math.floor(r() * BAD.length)]!] : [],
      });
    }
  }
  return out;
}

export function sampleStats(days: number, now = Date.now()) {
  const current = rows(days, now, 7, 0.72);
  const previous = rows(days, now - days * 86_400_000, 11, 0.66);
  return {
    ...computeStats(current, previous, { days, now: new Date(now) }),
    byLocation: [
      { id: "s1", name: "Colombo 07", total: Math.round(current.length * 0.45), satisfactionPct: 93, previousPct: 90, negative: 4 },
      { id: "s2", name: "Kandy", total: Math.round(current.length * 0.35), satisfactionPct: 88, previousPct: 91, negative: 7 },
      { id: "s3", name: "Galle", total: Math.round(current.length * 0.2), satisfactionPct: 85, previousPct: 80, negative: 5 },
    ],
    recovery: { sent: 18, answered: 11, recovered: 8, ratePct: 73 },
    pending: 3,
    truncated: false,
    account: null,
  };
}
