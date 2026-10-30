import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHighlightsToken, verifyHighlightsToken, buildCardToken } from "../../src/lib/security/signing.ts";
import { normalizeSurveyDomain, SURVEY_DOMAIN_PATHS, requestHost } from "../../src/lib/surveyDomainRules.ts";
import { buildReplyEmail } from "../../src/lib/sending/replyEmail.ts";
import { planAllows, showBranding, upgradeMessage } from "../../src/lib/billing/features.ts";
import { followupReplySchema } from "../../src/lib/validation/schemas.ts";
import { INDUSTRIES, INDUSTRY_IDS } from "../../src/lib/industries.ts";
import { readFileSync } from "node:fs";

const S = "s".repeat(40);
const ACC = "11111111-2222-4333-8444-555555555555";

test("highlights links are signed per business and month", () => {
  const t = buildHighlightsToken(S, ACC, "2026-10");
  assert.deepEqual(verifyHighlightsToken([S], t), { accountId: ACC, month: "2026-10" });
  assert.equal(verifyHighlightsToken([S], t.replace("2026-10", "2026-11")), null, "changing the month breaks it");
  assert.equal(verifyHighlightsToken(["x".repeat(40)], t), null);
  assert.equal(verifyHighlightsToken([S], buildCardToken(S, ACC)), null, "a card token isn't a highlights token");
  assert.throws(() => buildHighlightsToken(S, ACC, "2026-13"));
  assert.throws(() => buildHighlightsToken(S, "nope", "2026-10"));
});

test("survey web addresses: only real subdomains, never ours", () => {
  assert.equal(normalizeSurveyDomain(" https://Feedback.Kova.lk/ "), "feedback.kova.lk");
  assert.equal(normalizeSurveyDomain("rate.shop.co.uk"), "rate.shop.co.uk");
  for (const bad of ["kova.lk", "localhost", "x.taptruly.com", "a.vercel.app", "feedback..kova.lk", "-a.kova.lk", "a b.kova.lk", "feedback.kova.lk:8080x", "javascript:alert(1)", ""]) {
    assert.equal(normalizeSurveyDomain(bad), null, bad);
  }
  assert.ok(SURVEY_DOMAIN_PATHS.test("/r/abc"));
  assert.ok(SURVEY_DOMAIN_PATHS.test("/thanks/x"));
  assert.ok(SURVEY_DOMAIN_PATHS.test("/_next/static/a.js"));
  for (const p of ["/", "/login", "/app", "/admin", "/api/auth/login", "/signup", "/pricing", "/rx"]) assert.equal(SURVEY_DOMAIN_PATHS.test(p), false, p);
  assert.equal(requestHost(new Headers({ host: "Feedback.Kova.lk", "x-forwarded-host": "feedback.kova.lk, other" })), "feedback.kova.lk");
});

test("reply emails escape everything and keep subjects on one line", () => {
  const m = buildReplyEmail({ businessName: "Kova <b>", subject: "Sorry\r\nBcc: x@y.z", message: "Hi <script>alert(1)</script>\n\nThanks", customerComment: "bad & <i>slow</i>", showBranding: true });
  assert.equal(m.subject.includes("\n"), false);
  assert.equal(m.subject.includes("\r"), false);
  assert.doesNotMatch(m.html, /<script>|<i>|<b>/);
  assert.match(m.html, /&lt;script&gt;/);
  assert.match(m.html, /Sent with TapTruly/);
  assert.doesNotMatch(buildReplyEmail({ businessName: "K", subject: "s", message: "m", customerComment: null, showBranding: false }).html, /TapTruly/);
  assert.ok(followupReplySchema.safeParse({ subject: "Re: your feedback", message: "Hello" }).success);
  assert.equal(followupReplySchema.safeParse({ subject: "", message: "x" }).success, false);
  assert.equal(followupReplySchema.safeParse({ subject: "a", message: "x".repeat(2001) }).success, false);
  assert.equal(followupReplySchema.safeParse({ subject: "a", message: "x", extra: 1 }).success, false);
});

test("plan tiers: white label from Growth, own address on Scale", () => {
  assert.equal(planAllows("starter", "replies"), true);
  assert.equal(planAllows("free", "replies"), false);
  assert.equal(planAllows("starter", "white_label"), false);
  assert.equal(planAllows("growth", "white_label"), true);
  assert.equal(planAllows("growth", "custom_domain"), false);
  assert.equal(planAllows("scale", "custom_domain"), true);
  assert.equal(showBranding("growth", true), false);
  assert.equal(showBranding("starter", true), true, "downgraded: branding comes back");
  assert.equal(showBranding("scale", false), true);
  assert.match(upgradeMessage("white_label"), /Growth and Scale/);
  const sql = readFileSync(new URL("../../supabase/migrations/0036_branding_tiers.sql", import.meta.url), "utf8");
  assert.match(sql, /when 'white_label'\s+then coalesce\(p_plan in \('growth', 'scale'\)/);
  assert.match(sql, /when 'custom_domain' then p_plan = 'scale'/);
});

test("industries match the database list", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0037_benchmarks.sql", import.meta.url), "utf8");
  for (const id of INDUSTRY_IDS) assert.match(sql, new RegExp(`'${id}'`), id);
  assert.equal(new Set(INDUSTRIES.map((i) => i.id)).size, INDUSTRIES.length);
  assert.match(sql, /v_n >= 5/, "an average needs at least 5 other businesses");
});
