import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CATALOG } from "../../src/lib/billing/catalog.ts";
import { allowanceFor, buildCreditsEmail, creditLevel, leftPercent, lowThreshold, planLabel } from "../../src/lib/billing/credits.ts";

test("allowance: plan's monthly responses, or the free amount", () => {
  assert.equal(allowanceFor("starter", DEFAULT_CATALOG), 500);
  assert.equal(allowanceFor("scale", DEFAULT_CATALOG), 10000);
  assert.equal(allowanceFor("trial", DEFAULT_CATALOG), DEFAULT_CATALOG.free.responses);
  assert.equal(allowanceFor(null, DEFAULT_CATALOG), DEFAULT_CATALOG.free.responses);
  assert.equal(allowanceFor("free", { ...DEFAULT_CATALOG, free: { responses: 0, dailyEmails: 0 } }), 1);
});

test("levels: low at 80% used (min 5 left), out at 0", () => {
  assert.equal(lowThreshold(50), 10);
  assert.equal(lowThreshold(10), 5);
  assert.equal(creditLevel(50, 50), 0);
  assert.equal(creditLevel(11, 50), 0);
  assert.equal(creditLevel(10, 50), 1);
  assert.equal(creditLevel(1, 50), 1);
  assert.equal(creditLevel(0, 50), 2);
  assert.equal(creditLevel(-3, 50), 2);
  assert.equal(creditLevel(Number.NaN, 50), 2);
  assert.equal(creditLevel(101, 500), 0);
  assert.equal(creditLevel(100, 500), 1);
});

test("bar percent and plan label", () => {
  assert.equal(leftPercent(25, 50), 50);
  assert.equal(leftPercent(900, 500), 100);
  assert.equal(leftPercent(0, 50), 0);
  assert.equal(planLabel("trial"), "Free");
  assert.equal(planLabel("growth"), "Growth");
  assert.equal(planLabel("admin"), "Free");
});

test("email escapes the business name and keeps the subject on one line", () => {
  const m = buildCreditsEmail({ businessName: "<b>Bad</b>\r\nBcc: x", level: 1, balance: 7, paid: false, appOrigin: "https://taptruly.com/" });
  assert.ok(!m.html.includes("<b>Bad</b>"));
  assert.ok(m.html.includes("&lt;b&gt;Bad&lt;/b&gt;"));
  assert.ok(!/[\r\n]/.test(m.subject));
  assert.ok(m.html.includes("https://taptruly.com/app/settings/billing"));
  assert.match(m.subject, /7 responses left/);
  const out = buildCreditsEmail({ businessName: "Lanka Bakes", level: 2, balance: 0, paid: true, appOrigin: "https://taptruly.com" });
  assert.match(out.subject, /out of responses/);
  assert.match(out.text, /Add responses/);
});
