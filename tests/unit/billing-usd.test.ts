import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DEFAULT_CATALOG as C, isPayWayOn, payWays, quote } from "../../src/lib/billing/catalog.ts";
import { buildPayhereCheckout } from "../../src/lib/billing/payhere.ts";
import { checkoutSchema, promoPreviewSchema } from "../../src/lib/validation/schemas.ts";

const md5 = (s: string) => createHash("md5").update(s).digest("hex").toUpperCase();

test("pay ways: PayHere dollars only when switched on; Stripe only dollars", () => {
  assert.deepEqual(payWays({ payhere: true, stripe: false, payhereUsd: false }), [{ provider: "payhere", currency: "LKR" }]);
  const both = payWays({ payhere: true, stripe: false, payhereUsd: true });
  assert.equal(isPayWayOn(both, "payhere", "USD"), true);
  assert.equal(isPayWayOn(both, "stripe", "USD"), false);
  // payhereUsd without PayHere set up gives nothing extra
  assert.deepEqual(payWays({ payhere: false, stripe: true, payhereUsd: true }), [{ provider: "stripe", currency: "USD" }]);
  assert.equal(isPayWayOn(payWays({ payhere: true, stripe: true, payhereUsd: false }), "payhere", "USD"), false);
});

test("quote: PayHere in dollars uses the dollar price; Stripe can never be rupees", () => {
  const usd = quote(C, "growth", "month", "payhere", "USD")!;
  const growth = C.plans.find((p) => p.id === "growth")!;
  assert.equal(usd.currency, "USD");
  assert.equal(usd.amountMinor, growth.price.USD.month);
  assert.equal(quote(C, "growth", "month", "payhere")!.currency, "LKR", "default stays rupees");
  assert.equal(quote(C, "pack_250", null, "stripe", "LKR"), null);
  assert.equal(quote(C, "pack_250", null, "stripe", "EUR" as never), null);
});

test("checkout input: currency is optional and only LKR or USD", () => {
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "payhere", currency: "USD" }).success, true);
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "payhere" }).success, true);
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "payhere", currency: "EUR" }).success, false);
  assert.equal(promoPreviewSchema.safeParse({ code: "SAVE10", provider: "payhere", currency: "USD", interval: "year" }).success, true);
});

test("PayHere checkout in dollars: currency and hash use USD", () => {
  const { fields } = buildPayhereCheckout({
    sandbox: true, merchantId: "1211149", merchantSecret: "secret-secret-secret", orderId: "0f1e2d3c-4b5a-4968-8776-655443322110",
    amount: "49.00", currency: "USD", items: "TapTruly Growth",
    customer: { firstName: "A", lastName: "B", email: "a@b.co", phone: "0771234567", address: "x", city: "London", country: "GB" },
    appOrigin: "https://app.example", recurrence: "1 Month",
  });
  assert.equal(fields.currency, "USD");
  assert.equal(fields.hash, md5("1211149" + "0f1e2d3c-4b5a-4968-8776-655443322110" + "49.00" + "USD" + md5("secret-secret-secret")));
});
