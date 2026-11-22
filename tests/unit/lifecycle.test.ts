import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLifecycleEmail, pickLifecycleEmail } from "../../src/lib/lifecycle/emails.ts";

const now = Date.parse("2026-11-22T12:00:00Z");
const ago = (h: number) => new Date(now - h * 3600_000).toISOString();

test("the right welcome email at the right time, and never twice", () => {
  assert.equal(pickLifecycleEmail({ createdAt: ago(2), surveys: 0, ratings: 0, sent: [] }, now), null, "too early");
  assert.equal(pickLifecycleEmail({ createdAt: ago(21), surveys: 0, ratings: 0, sent: [] }, now), "setup");
  assert.equal(pickLifecycleEmail({ createdAt: ago(21), surveys: 1, ratings: 0, sent: [] }, now), null, "already made a survey");
  assert.equal(pickLifecycleEmail({ createdAt: ago(21), surveys: 0, ratings: 0, sent: ["setup"] }, now), null, "already sent");
  assert.equal(pickLifecycleEmail({ createdAt: ago(9 * 24), surveys: 0, ratings: 0, sent: [] }, now), "week1", "setup window passed");
  assert.equal(pickLifecycleEmail({ createdAt: ago(3), surveys: 1, ratings: 1, sent: [] }, now), "first_rating");
  assert.equal(pickLifecycleEmail({ createdAt: ago(3), surveys: 1, ratings: 5, sent: ["first_rating"] }, now), null);
  assert.equal(pickLifecycleEmail({ createdAt: ago(7 * 24 + 1), surveys: 1, ratings: 5, sent: ["first_rating"] }, now), "week1");
  assert.equal(pickLifecycleEmail({ createdAt: ago(11 * 24), surveys: 1, ratings: 5, sent: ["first_rating"] }, now), null, "week one passed");
  assert.equal(pickLifecycleEmail({ createdAt: ago(31 * 24), surveys: 1, ratings: 5, sent: [] }, now), null, "too old");
  assert.equal(pickLifecycleEmail({ createdAt: "nonsense", surveys: 0, ratings: 0, sent: [] }, now), null);
});

const base = { businessName: "Kova Café", ratings7d: 0, happy7d: 0, unhappy7d: 0, offer: null, appOrigin: "https://taptruly.com", unsubscribeUrl: "https://taptruly.com/reports/unsubscribe?tip=x&t=y" };

test("week one: numbers, and a plan suggestion only on the free plan", () => {
  const free = buildLifecycleEmail("week1", { ...base, ratings7d: 12, happy7d: 10, unhappy7d: 2, offer: { name: "Small shop", price: "Rs 1,990", responses: 150 } });
  assert.match(free.subject, /Kova Café’s first week: 12 ratings/);
  assert.match(free.text, /10 happy, 2 unhappy/);
  assert.match(free.text, /Small shop is Rs 1,990 a month/);
  assert.match(free.text, /\/app\/settings\/billing/);
  const paid = buildLifecycleEmail("week1", { ...base, ratings7d: 1, happy7d: 1 });
  assert.doesNotMatch(paid.text, /a month for/);
  assert.match(paid.subject, /1 rating$/);
  const none = buildLifecycleEmail("week1", base);
  assert.equal(none.subject, "Get your first ratings this week");
});

test("every email has a working stop link and no HTML injection", () => {
  for (const k of ["setup", "first_rating", "week1"] as const) {
    const m = buildLifecycleEmail(k, { ...base, businessName: "<script>x</script>\r\nBcc: a@b.c" });
    assert.match(m.html, /Stop these emails/);
    assert.match(m.html, /reports\/unsubscribe\?tip=x&amp;t=y/);
    assert.doesNotMatch(m.html, /<script>/);
    assert.doesNotMatch(m.subject, /[\r\n]/);
  }
});
