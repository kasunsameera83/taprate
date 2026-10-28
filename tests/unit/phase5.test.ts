import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { DEFAULT_CATALOG as C, catalogFromRows, formatMoney, majorAmount, quote } from "../../src/lib/billing/catalog.ts";
const PLANS = Object.fromEntries(C.plans.map((p) => [p.id, p])) as Record<string, (typeof C.plans)[number]>;
const PACKS = Object.fromEntries(C.packs.map((p) => [p.id, p])) as Record<string, (typeof C.packs)[number]>;
import { buildPayhereCheckout, payhereHash, verifyPayhereNotify } from "../../src/lib/billing/payhere.ts";
import { formEncode, invoiceSubscription, periodEnd, verifyStripeSignature } from "../../src/lib/billing/stripe.ts";
import { billingProfileSchema, checkoutSchema } from "../../src/lib/validation/schemas.ts";

const MID = "1211149";
const MSECRET = "MzM5NjE1NTY4MzI0MjU4OTc4NjQ5NTY4OTI0MjI1OTc5NTY3";
const ORDER = "0f1e2d3c-4b5a-4968-8776-655443322110";
const md5 = (s: string) => createHash("md5").update(s).digest("hex").toUpperCase();

test("catalog: prices only come from the server, and unknown items are refused", () => {
  const q = quote(C, "growth", "month", "payhere")!;
  assert.equal(q.currency, "LKR");
  assert.equal(q.amountMinor, PLANS.growth!.price.LKR.month);
  assert.equal(q.credits, PLANS.growth!.monthlyResponses);
  assert.equal(quote(C, "growth", "year", "stripe")!.credits, PLANS.growth!.monthlyResponses * 12);
  assert.equal(quote(C, "pack_250", null, "stripe")!.amountMinor, PACKS.pack_250!.price.USD);
  assert.equal(quote(C, "growth", null, "stripe"), null, "plan needs an interval");
  assert.equal(quote(C, "pack_250", "month", "stripe"), null, "packs aren't recurring");
  assert.equal(quote(C, "enterprise", "month", "stripe"), null);
  assert.equal(quote(C, "__proto__", "month", "stripe"), null);
  assert.equal(quote(C, "toString", null, "stripe"), null);
  assert.equal(majorAmount(149000), "1490.00");
  // Prices from the database; switched-off items can't be bought.
  const db = catalogFromRows([{ item: "growth", kind: "plan", name: "Growth+", blurb: "", responses: 2500, lkr_month: 1590000, lkr_year: 15900000, usd_month: 5900, usd_year: 59000, lkr_price: null, usd_price: null, active: true, sort: 1 }, { item: "pack_250", kind: "topup", name: "x", blurb: "", responses: 250, lkr_month: null, lkr_year: null, usd_month: null, usd_year: null, lkr_price: 1, usd_price: 1, active: false, sort: 2 }]);
  assert.equal(quote(db, "growth", "month", "payhere")!.amountMinor, 1590000);
  assert.equal(quote(db, "growth", "month", "payhere")!.credits, 2500);
  assert.equal(quote(db, "pack_250", null, "payhere"), null, "inactive pack");
  assert.equal(quote(db, "starter", "month", "stripe")!.amountMinor, PLANS.starter!.price.USD.month, "missing row falls back to default");
  assert.equal(formatMoney(1490000, "LKR"), "Rs 14,900");
  assert.equal(formatMoney(4900, "USD"), "$49.00");
});

test("checkout schema: ids only, never a price", () => {
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "stripe" }).success, true);
  assert.equal(checkoutSchema.safeParse({ item: "pack_250", provider: "payhere" }).success, true);
  assert.equal(checkoutSchema.safeParse({ item: "growth", provider: "stripe" }).success, false);
  assert.equal(checkoutSchema.safeParse({ item: "pack_250", interval: "month", provider: "stripe" }).success, false);
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "stripe", amount: 1 }).success, false, "strict");
  assert.equal(checkoutSchema.safeParse({ item: "growth", interval: "month", provider: "paypal" }).success, false);
  const p = billingProfileSchema.safeParse({ firstName: "Amaya", lastName: "Perera", email: "A@B.lk", phone: "+94 77 123 4567", address: "1 Galle Rd", city: "Colombo", country: "lk" });
  assert.ok(p.success && p.data.country === "LK" && p.data.email === "a@b.lk");
  assert.equal(billingProfileSchema.safeParse({ firstName: "A", lastName: "B", email: "a@b.lk", phone: "call me", address: "x", city: "y", country: "LK" }).success, false);
});

test("PayHere: checkout hash matches the documented formula; secret never sent", () => {
  assert.equal(payhereHash(MID, ORDER, "1490.00", "LKR", MSECRET), md5(MID + ORDER + "1490.00" + "LKR" + md5(MSECRET)));
  const { url, fields } = buildPayhereCheckout({
    sandbox: true,
    merchantId: MID,
    merchantSecret: MSECRET,
    orderId: ORDER,
    amount: "1490.00",
    currency: "LKR",
    items: "TapRate Growth",
    customer: { firstName: "A", lastName: "B", email: "a@b.lk", phone: "0771234567", address: "x", city: "Colombo", country: "LK" },
    appOrigin: "https://app.example",
    recurrence: "1 Month",
  });
  assert.equal(url, "https://sandbox.payhere.lk/pay/checkout");
  assert.equal(fields.notify_url, "https://app.example/api/webhooks/payhere");
  assert.equal(fields.recurrence, "1 Month");
  assert.equal(fields.duration, "Forever");
  assert.ok(!Object.values(fields).some((v) => v.includes(MSECRET)), "secret not in fields");
});

function notify(over: Record<string, string> = {}) {
  const base: Record<string, string> = { merchant_id: MID, order_id: ORDER, payment_id: "320025071278", payhere_amount: "1490.00", payhere_currency: "LKR", status_code: "2", message_type: "AUTHORIZATION_SUCCESS", subscription_id: "420075032251", item_rec_status: "0", item_rec_date_next: "2026-11-28" };
  const f = { ...base, ...over };
  f.md5sig = over.md5sig ?? md5(f.merchant_id! + f.order_id! + f.payhere_amount! + f.payhere_currency! + f.status_code! + md5(MSECRET));
  return new URLSearchParams(f);
}

test("PayHere notify: valid signature accepted; any tampering rejected", () => {
  const n = verifyPayhereNotify(notify(), MID, MSECRET);
  assert.ok(n);
  assert.equal(n!.amountMinor, 149000);
  assert.equal(n!.subscriptionId, "420075032251");
  assert.equal(n!.nextDate, "2026-11-28");
  // Changing the amount after signing.
  const t = notify();
  t.set("payhere_amount", "1.00");
  assert.equal(verifyPayhereNotify(t, MID, MSECRET), null);
  // Changing the status after signing.
  const t2 = notify({ status_code: "-2" });
  t2.set("status_code", "2");
  assert.equal(verifyPayhereNotify(t2, MID, MSECRET), null);
  assert.equal(verifyPayhereNotify(notify({ merchant_id: "999" }), MID, MSECRET), null, "other merchant");
  assert.equal(verifyPayhereNotify(notify({ md5sig: "0".repeat(32) }), MID, MSECRET), null);
  assert.equal(verifyPayhereNotify(notify(), MID, "wrong-secret-123"), null);
  assert.equal(verifyPayhereNotify(notify({ order_id: "1 OR 1=1" }), MID, MSECRET), null);
  const dup = notify();
  dup.append("order_id", ORDER);
  assert.equal(verifyPayhereNotify(dup, MID, MSECRET), null, "duplicated fields are ambiguous");
});

test("Stripe: webhook signature, replay window, multiple signatures", () => {
  const secret = "whsec_test123";
  const body = '{"id":"evt_1","type":"invoice.paid"}';
  const now = 1_800_000_000;
  const sig = (t: number, b = body, s = secret) => createHmac("sha256", s).update(`${t}.${b}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig(now)}`, secret, now), true);
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${sig(now)}`, secret, now), true, "any matching v1");
  assert.equal(verifyStripeSignature(body.replace("paid", "PAID"), `t=${now},v1=${sig(now)}`, secret, now), false, "body changed");
  assert.equal(verifyStripeSignature(body, `t=${now - 600},v1=${sig(now - 600)}`, secret, now), false, "too old");
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig(now, body, "whsec_other")}`, secret, now), false);
  assert.equal(verifyStripeSignature(body, `v1=${sig(now)}`, secret, now), false, "no timestamp");
  assert.equal(verifyStripeSignature(body, null, secret, now), false);
});

test("Stripe: form encoding and invoice shapes across API versions", () => {
  assert.equal(
    decodeURIComponent(formEncode({ mode: "payment", line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 1200 } }], metadata: { order_id: "x&y=z" } })),
    "mode=payment&line_items[0][quantity]=1&line_items[0][price_data][currency]=usd&line_items[0][price_data][unit_amount]=1200&metadata[order_id]=x&y=z",
  );
  assert.ok(formEncode({ metadata: { order_id: "x&y=z" } }).includes("x%26y%3Dz"), "values are escaped");
  assert.deepEqual(invoiceSubscription({ subscription: "sub_1", subscription_details: { metadata: { order_id: "o" } } }), { subscriptionId: "sub_1", metadata: { order_id: "o" } });
  assert.deepEqual(invoiceSubscription({ parent: { subscription_details: { subscription: "sub_2", metadata: { order_id: "p" } } } }), { subscriptionId: "sub_2", metadata: { order_id: "p" } });
  assert.deepEqual(invoiceSubscription({}), { subscriptionId: null, metadata: {} });
  assert.equal(periodEnd({ current_period_end: 1_800_000_000 }), new Date(1_800_000_000_000).toISOString());
  assert.equal(periodEnd({ items: { data: [{ current_period_end: 1_800_000_000 }] } }), new Date(1_800_000_000_000).toISOString());
  assert.equal(periodEnd(null), null);
});
