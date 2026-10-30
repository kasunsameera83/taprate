import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FREE, catalogFromRows, freeFromRow } from "../../src/lib/billing/catalog.ts";
import { applyFree, catalogItemSchema, withFree } from "../../src/lib/site/content.ts";

test("free plan values from the database are range-checked", () => {
  assert.deepEqual(freeFromRow(null), DEFAULT_FREE);
  assert.deepEqual(freeFromRow({ free_responses: 100, free_daily_emails: 0 }), { responses: 100, dailyEmails: 0 });
  assert.deepEqual(freeFromRow({ free_responses: -1, free_daily_emails: 5000 }), DEFAULT_FREE);
  assert.deepEqual(freeFromRow({ free_responses: "100", free_daily_emails: 1.5 }), DEFAULT_FREE);
  assert.equal(catalogFromRows([], { responses: 25, dailyEmails: 10 }).free.responses, 25);
});

test("admin free plan input is strict", () => {
  assert.ok(catalogItemSchema.safeParse({ kind: "free", responses: 100, dailyEmails: 50 }).success);
  assert.ok(catalogItemSchema.safeParse({ kind: "free", responses: 0, dailyEmails: 0 }).success);
  for (const bad of [
    { kind: "free", responses: 1001, dailyEmails: 50 },
    { kind: "free", responses: -1, dailyEmails: 50 },
    { kind: "free", responses: 1.5, dailyEmails: 50 },
    { kind: "free", responses: null, dailyEmails: 50 },
    { kind: "free", responses: "100", dailyEmails: 50 },
    { kind: "free", responses: 100, dailyEmails: 50, extra: 1 },
  ]) assert.equal(catalogItemSchema.safeParse(bad).success, false, JSON.stringify(bad));
});

test("{free} in landing text becomes the number, everywhere", () => {
  assert.equal(withFree("{free} free responses", 1000), "1,000 free responses");
  const c = applyFree({ hero: { note: "Get {free}." }, faq: [{ q: "How many?", a: "{free} to start" }], show: true, n: 3 }, 75);
  assert.deepEqual(c, { hero: { note: "Get 75." }, faq: [{ q: "How many?", a: "75 to start" }], show: true, n: 3 });
});
