import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CATALOG, quote } from "../../src/lib/billing/catalog.ts";
import { applyPromo, INVALID_CODE, normalizeCode, type Promo } from "../../src/lib/billing/promo.ts";
import { checkoutSchema, promoCodeSchema } from "../../src/lib/validation/schemas.ts";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const base: Promo = { id: "p1", code: "LAUNCH20", description: "", kind: "percent", percentOff: 20, amountOffLkr: null, amountOffUsd: null, bonusCredits: null, appliesTo: [], maxUses: null, startsAt: "2026-10-01T00:00:00Z", endsAt: null, enabled: true };
const fresh = { total: 0, usedByThisBusiness: false };
const growthLkr = quote(DEFAULT_CATALOG, "growth", "month", "payhere")!;
const packUsd = quote(DEFAULT_CATALOG, "pack_250", null, "stripe")!;

test("codes are normalised and strictly shaped", () => {
  assert.equal(normalizeCode(" launch20 "), "LAUNCH20");
  assert.equal(normalizeCode("ab"), null);
  assert.equal(normalizeCode("DROP TABLE"), null);
  assert.equal(normalizeCode(42), null);
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "payhere", promoCode: "launch20" }).success, true);
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "payhere", promoCode: "%' or 1=1" }).success, false);
});

test("percent, amount and bonus codes", () => {
  const p = applyPromo(base, growthLkr, fresh, NOW);
  assert.ok(p.ok && p.quote.amountMinor === Math.round(growthLkr.amountMinor * 0.8) && p.quote.listAmountMinor === growthLkr.amountMinor);
  const a = applyPromo({ ...base, kind: "amount", percentOff: null, amountOffLkr: 200000, amountOffUsd: null }, growthLkr, fresh, NOW);
  assert.ok(a.ok && a.quote.amountMinor === growthLkr.amountMinor - 200000);
  const noUsd = applyPromo({ ...base, kind: "amount", percentOff: null, amountOffLkr: 200000 }, packUsd, fresh, NOW);
  assert.ok(!noUsd.ok && /USD/.test(noUsd.reason), "amount code without a USD amount");
  const c = applyPromo({ ...base, kind: "credits", percentOff: null, bonusCredits: 500 }, packUsd, fresh, NOW);
  assert.ok(c.ok && c.quote.amountMinor === packUsd.amountMinor && c.quote.bonusCredits === 500);
  const tooBig = applyPromo({ ...base, kind: "amount", percentOff: null, amountOffUsd: 1190 }, packUsd, fresh, NOW);
  assert.ok(!tooBig.ok, "never below the minimum charge");
});

test("limits: dates, one per business, total uses, items", () => {
  assert.deepEqual(applyPromo(null, growthLkr, fresh, NOW), { ok: false, reason: INVALID_CODE });
  assert.deepEqual(applyPromo({ ...base, enabled: false }, growthLkr, fresh, NOW), { ok: false, reason: INVALID_CODE }, "switched off looks the same as unknown");
  assert.deepEqual(applyPromo({ ...base, startsAt: "2026-12-01T00:00:00Z" }, growthLkr, fresh, NOW), { ok: false, reason: INVALID_CODE });
  assert.equal(applyPromo({ ...base, endsAt: "2026-10-31T00:00:00Z" }, growthLkr, fresh, NOW).ok, false);
  assert.equal(applyPromo(base, growthLkr, { total: 0, usedByThisBusiness: true }, NOW).ok, false);
  assert.equal(applyPromo({ ...base, maxUses: 10 }, growthLkr, { total: 10, usedByThisBusiness: false }, NOW).ok, false);
  assert.equal(applyPromo({ ...base, appliesTo: ["starter"] }, growthLkr, fresh, NOW).ok, false);
  assert.equal(applyPromo({ ...base, appliesTo: ["growth"] }, growthLkr, fresh, NOW).ok, true);
});

test("admin promo form", () => {
  const ok = { code: "avurudu20", description: "", kind: "percent", percentOff: 20, amountOffLkr: null, amountOffUsd: null, bonusCredits: null, appliesTo: [], maxUses: 100, startsAt: "2027-04-01T00:00:00.000Z", endsAt: "2027-04-30T00:00:00.000Z", enabled: true };
  const p = promoCodeSchema.safeParse(ok);
  assert.ok(p.success && p.data.code === "AVURUDU20");
  assert.equal(promoCodeSchema.safeParse({ ...ok, percentOff: 100 }).success, false, "max 90%");
  assert.equal(promoCodeSchema.safeParse({ ...ok, kind: "amount", percentOff: null }).success, false, "amount needs a value");
  assert.ok((() => { const r = promoCodeSchema.safeParse({ ...ok, kind: "amount", percentOff: null, amountOffLkr: "1,000" }); return r.success && r.data.amountOffLkr === 100000; })());
  assert.equal(promoCodeSchema.safeParse({ ...ok, endsAt: "2027-03-01T00:00:00.000Z" }).success, false);
  assert.equal(promoCodeSchema.safeParse({ ...ok, appliesTo: ["enterprise"] }).success, false);
});
