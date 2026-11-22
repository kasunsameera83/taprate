import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CATALOG, quote } from "../../src/lib/billing/catalog.ts";
import { applyPromo, welcomeOfferEnds, type Promo } from "../../src/lib/billing/promo.ts";
import { offerTimeLeft } from "../../src/lib/billing/offer.ts";
import { promoCodeSchema } from "../../src/lib/validation/schemas.ts";
import { nudgeEligible, nudgeSnoozed, showUpgradeNudge, upgradeNudgeText, UPGRADE_NUDGE_SNOOZE_MS } from "../../src/lib/billing/nudge.ts";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const welcome: Promo = { id: "w1", code: "WELCOME50", description: "", kind: "percent", percentOff: 50, amountOffLkr: null, amountOffUsd: null, bonusCredits: null, appliesTo: [], maxUses: null, startsAt: "2026-11-01T00:00:00Z", endsAt: null, enabled: true, newBusinessDays: 7 };
const smallLkr = quote(DEFAULT_CATALOG, "small", "month", "payhere")!;
const use = (createdAt: string | null, hasPaid = false) => ({ total: 0, usedByThisBusiness: false, business: { createdAt, hasPaid } });

test("welcome offer works only for new businesses that have never paid", () => {
  const ok = applyPromo(welcome, smallLkr, use(ago(2)), NOW);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.quote.amountMinor, Math.round(smallLkr.amountMinor / 2));
  assert.equal(applyPromo(welcome, smallLkr, use(ago(8)), NOW).ok, false, "too old");
  assert.equal(applyPromo(welcome, smallLkr, use(ago(7)), NOW).ok, false, "deadline is exclusive");
  assert.equal(applyPromo(welcome, smallLkr, use(ago(1), true), NOW).ok, false, "already paid once");
  assert.equal(applyPromo(welcome, smallLkr, use(null), NOW).ok, false, "unknown sign-up date");
  assert.equal(applyPromo(welcome, smallLkr, { total: 0, usedByThisBusiness: false }, NOW).ok, false, "no business info: refuse");
  assert.equal(applyPromo(welcome, smallLkr, use("not a date"), NOW).ok, false, "bad date");
  const used = applyPromo(welcome, smallLkr, { ...use(ago(1)), usedByThisBusiness: true }, NOW);
  assert.equal(used.ok, false, "once per business");
});

test("the deadline is real and doesn't move", () => {
  assert.equal(welcomeOfferEnds(welcome, ago(2)), NOW + 5 * DAY);
  // The code's own end date wins when it's sooner.
  assert.equal(welcomeOfferEnds({ ...welcome, endsAt: new Date(NOW + DAY).toISOString() }, ago(2)), NOW + DAY);
  assert.equal(welcomeOfferEnds({ ...welcome, newBusinessDays: null }, ago(2)), null);
  assert.equal(offerTimeLeft(new Date(NOW + 5 * DAY).toISOString(), NOW).startsWith("Ends in 5 days ("), true);
  assert.equal(offerTimeLeft(new Date(NOW + 3 * 3600_000).toISOString(), NOW), "Ends in 3 hours");
  assert.equal(offerTimeLeft(new Date(NOW + 1000).toISOString(), NOW), "Ends in 1 hour");
  assert.equal(offerTimeLeft(new Date(NOW - 1000).toISOString(), NOW), "Ends today");
  assert.equal(offerTimeLeft("junk", NOW), "Ends today");
});

test("normal codes are unaffected", () => {
  const normal = { ...welcome, newBusinessDays: null };
  assert.equal(applyPromo(normal, smallLkr, { total: 0, usedByThisBusiness: false }, NOW).ok, true);
});

test("admin form: welcome days are 1–60 and optional", () => {
  const base = { code: "WELCOME50", description: "", kind: "percent", percentOff: 50, amountOffLkr: null, amountOffUsd: null, bonusCredits: null, appliesTo: [], maxUses: null, startsAt: "2026-11-01T00:00:00Z", endsAt: null, enabled: true };
  assert.equal(promoCodeSchema.safeParse(base).success, true);
  assert.equal(promoCodeSchema.safeParse({ ...base, newBusinessDays: 7 }).success, true);
  assert.equal(promoCodeSchema.safeParse({ ...base, newBusinessDays: null }).success, true);
  assert.equal(promoCodeSchema.safeParse({ ...base, newBusinessDays: 0 }).success, false);
  assert.equal(promoCodeSchema.safeParse({ ...base, newBusinessDays: 61 }).success, false);
  assert.equal(promoCodeSchema.safeParse({ ...base, newBusinessDays: 2.5 }).success, false);
  assert.equal(promoCodeSchema.safeParse({ ...base, newBusinessDays: "7" }).success, false);
});

test("upgrade card after the 10th rating, free/trial owners and admins only", () => {
  assert.equal(showUpgradeNudge({ plan: "free", role: "owner", ratings: 10 }), true);
  assert.equal(showUpgradeNudge({ plan: "trial", role: "admin", ratings: 42 }), true);
  assert.equal(showUpgradeNudge({ plan: "free", role: "owner", ratings: 9 }), false);
  assert.equal(showUpgradeNudge({ plan: "free", role: "viewer", ratings: 50 }), false);
  assert.equal(showUpgradeNudge({ plan: "small", role: "owner", ratings: 50 }), false);
  assert.equal(showUpgradeNudge({ plan: "free", role: "owner", ratings: NaN }), false);
  assert.equal(nudgeEligible(null, "owner"), false);
  assert.equal(upgradeNudgeText(10, { name: "Small shop", price: "Rs 1,990" }).title, "You've heard from 10 customers");
  assert.match(upgradeNudgeText(1234, { name: "Small shop", price: "Rs 1,990" }).body, /Rs 1,990 a month with Small shop/);
});

test("'Not now' hides it for 14 days; junk in storage never hides it", () => {
  assert.equal(nudgeSnoozed(null, NOW), false);
  assert.equal(nudgeSnoozed(String(NOW - DAY), NOW), true);
  assert.equal(nudgeSnoozed(String(NOW - UPGRADE_NUDGE_SNOOZE_MS), NOW), false);
  assert.equal(nudgeSnoozed("abc", NOW), false);
  assert.equal(nudgeSnoozed(String(NOW + 10 * DAY), NOW), false, "a future time can't hide it forever");
});

test("dashboard pop-up: once, then once more on the last day, never after", async () => {
  const { offerPopupStage } = await import("../../src/lib/billing/offer.ts");
  const in5d = new Date(NOW + 5 * DAY).toISOString();
  const in3h = new Date(NOW + 3 * 3600_000).toISOString();
  assert.equal(offerPopupStage(null, in5d, NOW), "first");
  assert.equal(offerPopupStage("first", in5d, NOW), null);
  assert.equal(offerPopupStage("first", in3h, NOW), "last");
  assert.equal(offerPopupStage("last", in3h, NOW), null);
  assert.equal(offerPopupStage(null, in3h, NOW), "last");
  assert.equal(offerPopupStage("junk", in5d, NOW), "first");
  assert.equal(offerPopupStage(null, new Date(NOW - 1000).toISOString(), NOW), null);
  assert.equal(offerPopupStage(null, "junk", NOW), null);
});
