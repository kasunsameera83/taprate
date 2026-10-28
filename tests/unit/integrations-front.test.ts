import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckRequest, checkResponseOk, FRONT_BASE, frontCommentRequest, frontConversationId, helpdeskCredential, noteText } from "../../src/lib/helpdesk.ts";
import { checkIntegrationUrl, isHelpdesk } from "../../src/lib/security/urlSafety.ts";
import { helpdeskCreateSchema } from "../../src/lib/validation/schemas.ts";
import { MERGE_PRESETS, MERGE_TAG_RE } from "../../src/lib/surveys/snippet.ts";

const base = { ratingLabel: "Poor", rating: 2, sentiment: "negative" as const, surveyName: "Support", agent: "Nimal", link: "https://app/x" };
const JWT = `${"a".repeat(36)}.${"b".repeat(80)}.${"c".repeat(43)}`;

test("front: fixed API host only", () => {
  assert.equal(isHelpdesk("front"), true);
  assert.equal(FRONT_BASE, "https://api2.frontapp.com");
  assert.equal(checkIntegrationUrl("front", "https://api2.frontapp.com/me").ok, true);
  assert.equal(checkIntegrationUrl("front", "https://api2.frontapp.com.evil.io/me").ok, false);
  assert.equal(checkIntegrationUrl("front", "https://evil.frontapp.com").ok, false);
  assert.equal(checkIntegrationUrl("front", "http://api2.frontapp.com").ok, false);
});

test("front: only real conversation ids are matched", () => {
  assert.equal(frontConversationId("cnv_1a2b3c"), "cnv_1a2b3c");
  assert.equal(frontConversationId(" cnv_abc "), "cnv_abc");
  for (const bad of ["1042", "cnv_", "cnv_../x", "cnv_ABC", "msg_123", "cnv_1/comments", null, undefined, "{{conversation.id}}"]) assert.equal(frontConversationId(bad), null, String(bad));
});

test("front: internal comment, bearer token, text kept as text", () => {
  const cred = helpdeskCredential({ kind: "front", apiToken: JWT });
  assert.equal(cred, JWT);
  const req = frontCommentRequest(cred, "cnv_9z", noteText({ ...base, comment: "<img src=x onerror=alert(1)>" }, "comment"));
  assert.equal(req.url, "https://api2.frontapp.com/conversations/cnv_9z/comments");
  assert.equal(req.method, "POST");
  assert.equal(req.headers.Authorization, `Bearer ${JWT}`);
  const body = JSON.parse(req.body!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["body"]); // no author: posted as the token's own bot
  assert.throws(() => frontCommentRequest(cred, "cnv_1/../../teammates", "x"));
  assert.throws(() => frontCommentRequest(cred, "123", "x"));
  assert.equal(buildCheckRequest("front", FRONT_BASE, cred).url, "https://api2.frontapp.com/me");
  assert.equal(checkResponseOk("front", 200, { name: "TapTruly" }), true);
  assert.equal(checkResponseOk("front", 401, {}), false);
});

test("front: connect form accepts only an API token", () => {
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "front", name: "Front", apiToken: JWT, events: ["all"] }).success, true);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "front", name: "Front", apiToken: "short", events: ["all"] }).success, false);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "front", name: "Front", apiToken: `${JWT} extra`, events: ["all"] }).success, false);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "front", name: "Front", apiToken: JWT, subdomain: "evil", events: ["all"] }).success, false);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "front", name: "Front", apiToken: "x".repeat(2000), events: ["all"] }).success, false);
});

test("front: merge tags are allowed in links", () => {
  const p = MERGE_PRESETS.front;
  for (const tag of [p.email, p.agent, p.ticket]) assert.match(tag, MERGE_TAG_RE);
});
