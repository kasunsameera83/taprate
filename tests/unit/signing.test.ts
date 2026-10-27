import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLinkToken,
  parseLinkToken,
  verifyLinkToken,
  signMetadata,
  verifyMetadata,
  createResponseToken,
  verifyResponseToken,
} from "../../src/lib/security/signing.ts";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const OTHER = "other-secret-0123456789-abcdefghijklmno";
const SURVEY = "5a000000-0000-4000-8000-000000000001";
const SURVEY2 = "5b000000-0000-4000-8000-000000000002";
const RESP = "7c000000-0000-4000-8000-000000000003";

test("valid link token round-trips", () => {
  const token = buildLinkToken(SECRET, SURVEY, 5);
  const parsed = parseLinkToken(token);
  assert.ok(parsed);
  assert.equal(parsed.surveyId, SURVEY);
  assert.equal(parsed.rating, 5);
  assert.equal(verifyLinkToken([SECRET], parsed), true);
});

test("changing the rating in the URL is rejected", () => {
  const token = buildLinkToken(SECRET, SURVEY, 5);
  const tampered = token.replace(`.${5}.`, ".1.");
  const parsed = parseLinkToken(tampered);
  assert.ok(parsed);
  assert.equal(verifyLinkToken([SECRET], parsed), false);
});

test("reusing a signature for another survey is rejected", () => {
  const sig = buildLinkToken(SECRET, SURVEY, 5).split(".")[2];
  const parsed = parseLinkToken(`${SURVEY2}.5.${sig}`);
  assert.ok(parsed);
  assert.equal(verifyLinkToken([SECRET], parsed), false);
});

test("a token signed with a different secret is rejected", () => {
  const parsed = parseLinkToken(buildLinkToken(OTHER, SURVEY, 3));
  assert.ok(parsed);
  assert.equal(verifyLinkToken([SECRET], parsed), false);
});

test("previous secret still verifies during key rotation", () => {
  const parsed = parseLinkToken(buildLinkToken(OTHER, SURVEY, 3));
  assert.ok(parsed);
  assert.equal(verifyLinkToken([SECRET, OTHER], parsed), true);
});

test("malformed tokens are rejected before any crypto", () => {
  for (const bad of [
    "",
    "abc",
    `${SURVEY}.5`,
    `${SURVEY}.11.AAAAAAAAAAAAAAAAAAAAAA`,
    `${SURVEY}.05.AAAAAAAAAAAAAAAAAAAAAA`,
    `${SURVEY}.-1.AAAAAAAAAAAAAAAAAAAAAA`,
    `${SURVEY.toUpperCase()}.5.AAAAAAAAAAAAAAAAAAAAAA`,
    `${SURVEY}.5.AAAA`,
    `${SURVEY}.5.AAAAAAAAAAAAAAAAAAAAAA.extra`,
    `../../etc/passwd`,
    `${SURVEY}.5.AAAAAAAAAAAAAAAAAAAA%2F`,
    "x".repeat(500),
  ]) {
    assert.equal(parseLinkToken(bad), null, `should reject: ${bad.slice(0, 60)}`);
  }
});

test("short or missing secrets are refused", () => {
  assert.throws(() => buildLinkToken("short", SURVEY, 1));
  assert.throws(() => buildLinkToken("", SURVEY, 1));
});

test("metadata signature covers every field", () => {
  const meta = { email: "c@x.com", agent: "Sarah", ticket: "T-1" };
  const sig = signMetadata(SECRET, SURVEY, meta);
  assert.equal(verifyMetadata([SECRET], SURVEY, meta, sig), true);
  assert.equal(verifyMetadata([SECRET], SURVEY, { ...meta, agent: "Bob" }, sig), false);
  assert.equal(verifyMetadata([SECRET], SURVEY, { ...meta, email: "evil@x.com" }, sig), false);
  assert.equal(verifyMetadata([SECRET], SURVEY2, meta, sig), false);
  assert.equal(verifyMetadata([SECRET], SURVEY, meta, null), false);
  // Delimiter tricks cannot move text between fields.
  const a = signMetadata(SECRET, SURVEY, { email: "a", agent: "b|c", ticket: "" });
  assert.equal(verifyMetadata([SECRET], SURVEY, { email: "a|b", agent: "c", ticket: "" }, a), false);
});

test("response tokens expire and are bound to one response", () => {
  const now = 1_800_000_000;
  const token = createResponseToken(SECRET, RESP, now);
  assert.equal(verifyResponseToken(SECRET, RESP, token, now + 10), true);
  assert.equal(verifyResponseToken(SECRET, RESP, token, now + 8 * 24 * 3600), false, "expired");
  assert.equal(verifyResponseToken(SECRET, "7c000000-0000-4000-8000-000000000004", token, now), false, "other response");
  assert.equal(verifyResponseToken(OTHER, RESP, token, now), false, "other secret");
  const [exp, sig] = token.split(".");
  assert.equal(verifyResponseToken(SECRET, RESP, `${Number(exp) + 999}.${sig}`, now), false, "extended expiry");
  assert.equal(verifyResponseToken(SECRET, RESP, "garbage", now), false);
});
