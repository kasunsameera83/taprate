import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubAnalyticsUrl } from "../../src/lib/analytics/scrub.ts";

const O = "https://taptruly.com";

test("customer-facing token pages and sign-in pages are never recorded", () => {
  for (const p of ["/r/abc123", "/s/tok", "/c/x", "/h/x", "/k/x", "/w/x", "/tv/x", "/wall/x", "/thanks/123", "/unsubscribe?t=secret", "/reports/unsubscribe?t=x", "/closed", "/auth/callback?code=secret", "/reset-password#token"]) {
    assert.equal(scrubAnalyticsUrl(O + p), null, p);
  }
});

test("query strings are dropped except utm_*, and the hash is removed", () => {
  assert.equal(scrubAnalyticsUrl(`${O}/?utm_source=facebook&utm_medium=paid&utm_campaign=reel01&fbclid=abc&email=a@b.c#top`), `${O}/?utm_source=facebook&utm_medium=paid&utm_campaign=reel01`);
  assert.equal(scrubAnalyticsUrl(`${O}/signup?ref=friend&token=x`), `${O}/signup`);
  assert.equal(scrubAnalyticsUrl(`${O}/compare`), `${O}/compare`);
});

test("ids in the path are replaced", () => {
  assert.equal(scrubAnalyticsUrl(`${O}/app/surveys/3f2b1c4d-1111-4222-8333-444455556666/poster`), `${O}/app/surveys/:id/poster`);
  assert.equal(scrubAnalyticsUrl(`${O}/blog/how-to-get-more-reviews`), `${O}/blog/how-to-get-more-reviews`);
  assert.equal(scrubAnalyticsUrl(`${O}/blog/top-10-tips-for-2026`), `${O}/blog/top-10-tips-for-2026`);
  assert.equal(scrubAnalyticsUrl(`${O}/app/orders/Xk9_pQ2rT7vB3mZ8aL`), `${O}/app/orders/:id`);
});

test("rubbish and non-web URLs record nothing", () => {
  assert.equal(scrubAnalyticsUrl("not a url"), null);
  assert.equal(scrubAnalyticsUrl("javascript:alert(1)"), null);
});

test("the strip keeps the first 'r' route distinct from real pages", () => {
  assert.equal(scrubAnalyticsUrl(`${O}/refund-policy`), `${O}/refund-policy`);
  assert.equal(scrubAnalyticsUrl(`${O}/reports`), `${O}/reports`);
});
