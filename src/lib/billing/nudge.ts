// The dashboard's upgrade card: shown to owners/admins on the free plan or trial once real customers
// have rated them (the moment TapTruly has proved itself). Pure and unit-tested.

export const UPGRADE_NUDGE_AT = 10;
/** After "Not now" the card stays hidden this long. */
export const UPGRADE_NUDGE_SNOOZE_MS = 14 * 86_400_000;
export const upgradeNudgeKey = (accountId: string) => `tt.upgradeNudge.${accountId}`;

/** Worth checking at all (saves the extra queries for paid plans and viewers). */
export function nudgeEligible(plan: string | null | undefined, role: string | null | undefined): boolean {
  return (plan === "free" || plan === "trial") && (role === "owner" || role === "admin");
}

export function showUpgradeNudge(i: { plan: string | null | undefined; role: string | null | undefined; ratings: number }): boolean {
  return nudgeEligible(i.plan, i.role) && Number.isFinite(i.ratings) && i.ratings >= UPGRADE_NUDGE_AT;
}

/** Hidden if "Not now" was pressed within the snooze period. Bad or missing values never hide it. */
export function nudgeSnoozed(stored: string | null, now = Date.now()): boolean {
  const t = stored === null ? NaN : Number(stored);
  return Number.isFinite(t) && t <= now && now - t < UPGRADE_NUDGE_SNOOZE_MS;
}

export function upgradeNudgeText(ratings: number, plan: { name: string; price: string }): { title: string; body: string } {
  const n = Math.max(UPGRADE_NUDGE_AT, Math.floor(ratings));
  return {
    title: `You've heard from ${n.toLocaleString("en")} customers`,
    body: `Keep every rating coming for ${plan.price} a month with ${plan.name}. Pay a month at a time; nothing is charged automatically.`,
  };
}
