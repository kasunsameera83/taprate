import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CATALOG, quote, withinPaymentLimit } from "../../src/lib/billing/catalog.ts";

const MAX = 50000 * 100; // Rs 50,000 in cents

test("PayHere rupee limit blocks yearly plans but allows monthly and packs", () => {
  const yearly = quote(DEFAULT_CATALOG, "starter", "year", "payhere", "LKR")!;
  const monthly = quote(DEFAULT_CATALOG, "scale", "month", "payhere", "LKR")!;
  const pack = quote(DEFAULT_CATALOG, "pack_5000", null, "payhere", "LKR")!;
  assert.equal(withinPaymentLimit("payhere", "LKR", yearly.amountMinor, MAX), false);
  assert.equal(withinPaymentLimit("payhere", "LKR", monthly.amountMinor, MAX), true);
  assert.equal(withinPaymentLimit("payhere", "LKR", pack.amountMinor, MAX), true);
  assert.equal(withinPaymentLimit("payhere", "LKR", MAX, MAX), true);
  assert.equal(withinPaymentLimit("payhere", "LKR", MAX + 1, MAX), false);
});

test("the limit only applies to PayHere in rupees, and only when set", () => {
  assert.equal(withinPaymentLimit("stripe", "USD", 10_000_000, MAX), true);
  assert.equal(withinPaymentLimit("payhere", "USD", 10_000_000, MAX), true);
  assert.equal(withinPaymentLimit("payhere", "LKR", 10_000_000, null), true);
  assert.equal(withinPaymentLimit("payhere", "LKR", 10_000_000, undefined), true);
});
