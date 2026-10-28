import { test } from "node:test";
import assert from "node:assert/strict";
import { getClientIp, hashIp, buildDedupeKey, isSameOriginRequest, isJsonRequest } from "../../src/lib/security/request.ts";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const APP = "https://app.taptruly.example";

test("client IP comes from platform headers and is validated", () => {
  assert.equal(getClientIp(h({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(getClientIp(h({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" })), "198.51.100.2");
  assert.equal(getClientIp(h({ "x-real-ip": "<script>" })), "unknown");
  assert.equal(getClientIp(h({ "x-real-ip": "999.1.1.1" })), "unknown");
  assert.equal(getClientIp(h({})), "unknown");
});

test("IP hashes are salted and stable", () => {
  const salt = "salt-salt-salt-salt-1234";
  assert.equal(hashIp(salt, "1.2.3.4"), hashIp(salt, "1.2.3.4"));
  assert.notEqual(hashIp(salt, "1.2.3.4"), hashIp("another-salt-123456789", "1.2.3.4"));
  assert.match(hashIp(salt, "1.2.3.4"), /^[0-9a-f]{64}$/);
  assert.throws(() => hashIp("", "1.2.3.4"));
});

test("dedupe key: same recipient + ticket -> same key, regardless of device", () => {
  const base = { surveyId: "s1", email: "C@X.com", ticket: "T-1" };
  const a = buildDedupeKey({ ...base, ipHash: "a".repeat(64), userAgent: "ua1" });
  const b = buildDedupeKey({ ...base, email: "c@x.com", ipHash: "b".repeat(64), userAgent: "ua2" });
  assert.equal(a, b);
  assert.notEqual(a, buildDedupeKey({ ...base, ticket: "T-2", ipHash: "a".repeat(64), userAgent: "ua1" }));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("dedupe key without recipient uses device + 30 minute window", () => {
  const base = { surveyId: "s1", ipHash: "a".repeat(64), userAgent: "ua" };
  const t = Date.UTC(2026, 9, 27, 10, 0, 0);
  assert.equal(buildDedupeKey({ ...base, nowMs: t }), buildDedupeKey({ ...base, nowMs: t + 5 * 60_000 }));
  assert.notEqual(buildDedupeKey({ ...base, nowMs: t }), buildDedupeKey({ ...base, nowMs: t + 31 * 60_000 }));
  assert.notEqual(buildDedupeKey({ ...base, nowMs: t }), buildDedupeKey({ ...base, ipHash: "b".repeat(64), nowMs: t }));
});

test("same-origin check blocks cross-site writes", () => {
  assert.equal(isSameOriginRequest("POST", h({ origin: APP }), APP), true);
  assert.equal(isSameOriginRequest("POST", h({ origin: "https://evil.example" }), APP), false);
  assert.equal(isSameOriginRequest("POST", h({ origin: "https://app.taptruly.example.evil.com" }), APP), false);
  assert.equal(isSameOriginRequest("POST", h({ origin: "null" }), APP), false);
  assert.equal(isSameOriginRequest("DELETE", h({}), APP), false, "no origin and no referer");
  assert.equal(isSameOriginRequest("PATCH", h({ referer: `${APP}/app/surveys` }), APP), true);
  assert.equal(isSameOriginRequest("PATCH", h({ referer: "https://evil.example/x" }), APP), false);
  assert.equal(isSameOriginRequest("GET", h({}), APP), true);
});

test("JSON content type required", () => {
  assert.equal(isJsonRequest(h({ "content-type": "application/json" })), true);
  assert.equal(isJsonRequest(h({ "content-type": "application/json; charset=utf-8" })), true);
  assert.equal(isJsonRequest(h({ "content-type": "text/plain" })), false);
  assert.equal(isJsonRequest(h({ "content-type": "application/x-www-form-urlencoded" })), false);
  assert.equal(isJsonRequest(h({})), false);
});
