import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CATALOG, PLAN_IDS, SEND_LIMITS, catalogFromRows, prepaidQuote, quote, withinPaymentLimit } from "../../src/lib/billing/catalog.ts";
import { isPaidPlan, planAllows, planLimits } from "../../src/lib/billing/features.ts";
import { planLabel } from "../../src/lib/billing/credits.ts";
import { checkoutSchema } from "../../src/lib/validation/schemas.ts";

test("Small shop: Rs 1,990 / $7 for 150 responses, the cheapest plan, shown first", () => {
  assert.equal(PLAN_IDS[0], "small");
  const small = DEFAULT_CATALOG.plans.find((p) => p.id === "small")!;
  assert.equal(small.monthlyResponses, 150);
  assert.equal(small.price.LKR.month, 199000);
  assert.equal(small.price.USD.month, 700);
  for (const p of DEFAULT_CATALOG.plans) if (p.id !== "small") assert.ok(p.price.LKR.month > small.price.LKR.month && p.price.USD.month > small.price.USD.month, p.id);
  assert.equal(SEND_LIMITS.small, 150);
});

test("Small shop is priced by the server and fits PayHere's limit, also for 3 months", () => {
  const q = quote(DEFAULT_CATALOG, "small", "month", "payhere", "LKR")!;
  assert.equal(q.amountMinor, 199000);
  assert.equal(q.credits, 150);
  const three = prepaidQuote(DEFAULT_CATALOG, "small", 3, "payhere", "LKR")!;
  assert.equal(three.amountMinor, 597000);
  assert.equal(three.credits, 450);
  assert.equal(withinPaymentLimit("payhere", "LKR", three.amountMinor, 5_000_000), true);
  assert.equal(quote(DEFAULT_CATALOG, "small", "month", "stripe")!.amountMinor, 700);
});

test("Small shop can be bought, and switched off by the owner", () => {
  assert.equal(checkoutSchema.safeParse({ item: "small", interval: "month", provider: "payhere" }).success, true);
  assert.equal(checkoutSchema.safeParse({ item: "tiny", interval: "month", provider: "payhere" }).success, false);
  const off = catalogFromRows([{ item: "small", kind: "plan", name: "Small shop", blurb: "", responses: 150, lkr_month: 199000, lkr_year: 1990000, usd_month: 700, usd_year: 7000, lkr_price: null, usd_price: null, active: false, sort: 0 }]);
  assert.equal(quote(off, "small", "month", "payhere"), null);
});

test("Small shop gets Starter's features, not Growth's", () => {
  assert.equal(isPaidPlan("small"), true);
  for (const f of ["integrations", "api", "tv", "ai", "reports", "repeats", "social", "replies"] as const) assert.equal(planAllows("small", f), planAllows("starter", f), f);
  assert.equal(planAllows("small", "white_label"), false);
  assert.equal(planAllows("small", "own_domain"), false);
  assert.deepEqual(planLimits("small"), planLimits("starter"));
  assert.equal(planLabel("small"), "Small shop");
});
