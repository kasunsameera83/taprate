import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CATALOG as C, prepaidQuote, withinPaymentLimit } from "../../src/lib/billing/catalog.ts";
import { applyPromo, type Promo } from "../../src/lib/billing/promo.ts";
import { buildPlanEmail } from "../../src/lib/billing/planEmails.ts";
import { checkoutSchema, promoPreviewSchema } from "../../src/lib/validation/schemas.ts";

test("prepaid quote: N x monthly price and responses, only 1 or 3 months, only plans", () => {
  const one = prepaidQuote(C, "starter", 1, "payhere", "LKR")!;
  assert.equal(one.amountMinor, 590000);
  assert.equal(one.credits, 500);
  assert.equal(one.interval, "month");
  assert.equal(one.months, 1);
  const three = prepaidQuote(C, "growth", 3, "payhere", "LKR")!;
  assert.equal(three.amountMinor, 1490000 * 3);
  assert.equal(three.credits, 6000);
  assert.match(three.description, /3 months/);
  assert.equal(prepaidQuote(C, "starter", 2, "payhere", "LKR"), null);
  assert.equal(prepaidQuote(C, "starter", "3", "payhere", "LKR"), null);
  assert.equal(prepaidQuote(C, "pack_250", 1, "payhere", "LKR"), null);
  assert.equal(prepaidQuote(C, "starter", 1, "stripe", "LKR"), null);
});

test("3 months of Scale is above a Rs 50,000 limit; Starter and Growth fit", () => {
  const max = 50000 * 100;
  assert.equal(withinPaymentLimit("payhere", "LKR", prepaidQuote(C, "starter", 3, "payhere", "LKR")!.amountMinor, max), true);
  assert.equal(withinPaymentLimit("payhere", "LKR", prepaidQuote(C, "growth", 3, "payhere", "LKR")!.amountMinor, max), true);
  assert.equal(withinPaymentLimit("payhere", "LKR", prepaidQuote(C, "scale", 3, "payhere", "LKR")!.amountMinor, max), false);
});

test("checkout accepts months only for a monthly plan", () => {
  assert.equal(checkoutSchema.safeParse({ item: "starter", interval: "month", provider: "payhere", months: 3 }).success, true);
  assert.equal(checkoutSchema.safeParse({ item: "starter", interval: "month", provider: "payhere", months: 2 }).success, false);
  assert.equal(checkoutSchema.safeParse({ item: "starter", interval: "year", provider: "payhere", months: 1 }).success, false);
  assert.equal(checkoutSchema.safeParse({ item: "pack_250", provider: "payhere", months: 1 }).success, false);
  assert.equal(checkoutSchema.safeParse({ item: "starter", interval: "month", provider: "payhere", months: "3" }).success, false);
  assert.equal(promoPreviewSchema.safeParse({ code: "LAUNCH50", provider: "payhere", interval: "month", months: 3 }).success, true);
  assert.equal(promoPreviewSchema.safeParse({ code: "LAUNCH50", provider: "payhere", interval: "month", months: 12 }).success, false);
});

test("a promo on a prepaid plan says 'off', not 'off every month'", () => {
  const promo: Promo = { id: "p", code: "LAUNCH50", description: "", kind: "percent", percentOff: 50, amountOffLkr: null, amountOffUsd: null, bonusCredits: null, appliesTo: [], maxUses: null, startsAt: "2020-01-01T00:00:00Z", endsAt: null, enabled: true };
  const r = applyPromo(promo, prepaidQuote(C, "starter", 3, "payhere", "LKR")!, { total: 0, usedByThisBusiness: false });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.quote.amountMinor, 885000);
    assert.equal(r.quote.months, 3);
    assert.equal(r.summary, "50% off");
  }
});

test("plan emails escape names and keep subjects on one line", () => {
  const m = buildPlanEmail({ kind: "ending", businessName: "<script>x</script>\nBcc: y", planName: "Starter", endsAt: "2026-12-01T10:00:00Z", appOrigin: "https://taptruly.com" });
  assert.ok(!m.html.includes("<script>"));
  assert.ok(!/[\r\n]/.test(m.subject));
  assert.match(m.subject, /ends on 1 December 2026/);
  assert.ok(m.html.includes("https://taptruly.com/app/settings/billing"));
  const e = buildPlanEmail({ kind: "ended", businessName: "Lanka Bakes", planName: "Growth", endsAt: "2026-12-01T10:00:00Z", appOrigin: "https://taptruly.com" });
  assert.match(e.subject, /has ended/);
  assert.match(e.text, /free plan/);
});
