import { test } from "node:test";
import assert from "node:assert/strict";
import { apiKeyHint, bearerToken, formatApiKey, keyIsUsable, newApiKeySecret, parseApiKey, secretMatches } from "../../src/lib/security/apiKeys.ts";
import { decodeCursor, encodeCursor } from "../../src/lib/api/cursor.ts";
import { buildCheckRequest, buildNoteRequest, checkResponseOk, helpdeskBaseUrl, helpdeskCredential, noteText, ticketNumber } from "../../src/lib/helpdesk.ts";
import { checkIntegrationUrl } from "../../src/lib/security/urlSafety.ts";
import { checkAll, checkRow, detectColumns, parseCsv, parseDateCell } from "../../src/lib/csvImport.ts";
import { apiKeyCreateSchema, apiLinksSchema, apiResponsesQuerySchema, helpdeskCreateSchema, importRowSchema, parseClickParams } from "../../src/lib/validation/schemas.ts";
import { signMetadata, verifyMetadata } from "../../src/lib/security/signing.ts";

const KEY_ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const SURVEY = "5a000000-0000-4000-8000-000000000001";

test("API keys: format, parsing and constant-time check", () => {
  const { secret, hash } = newApiKeySecret();
  const key = formatApiKey(KEY_ID, secret);
  assert.match(key, /^tr_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(parseApiKey(key), { keyId: KEY_ID, secret });
  assert.equal(secretMatches(hash, secret), true);
  assert.equal(secretMatches(hash, newApiKeySecret().secret), false);
  assert.equal(hash.length, 64);
  assert.equal(apiKeyHint(KEY_ID), "tr_0f1e2d3c…");
  assert.ok(!apiKeyHint(KEY_ID).includes(secret.slice(0, 6)));
  for (const bad of ["", "tr_abc_def", `${key}x`, key.replace("tr_", "tk_"), `tr_${"G".repeat(32)}_${secret}`, null, undefined]) {
    assert.equal(parseApiKey(bad as string), null, String(bad));
  }
});

test("API keys: only the Bearer header, and revoked/expired keys refused", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("bearer   abc"), "abc");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken("Bearer a b"), null);
  assert.equal(bearerToken(null), null);
  const now = Date.parse("2026-10-01T00:00:00Z");
  assert.equal(keyIsUsable({ revoked_at: null, expires_at: null }, now), true);
  assert.equal(keyIsUsable({ revoked_at: "2026-09-01T00:00:00Z", expires_at: null }, now), false);
  assert.equal(keyIsUsable({ revoked_at: null, expires_at: "2026-09-30T23:59:59Z" }, now), false);
  assert.equal(keyIsUsable({ revoked_at: null, expires_at: "2026-10-02T00:00:00Z" }, now), true);
});

test("API key creation schema", () => {
  assert.equal(apiKeyCreateSchema.safeParse({ name: "CRM", access: "read", expiresInDays: 90, password: "x" }).success, true);
  assert.equal(apiKeyCreateSchema.safeParse({ name: "CRM", access: "read", expiresInDays: null, password: "x" }).success, true);
  assert.equal(apiKeyCreateSchema.safeParse({ name: "CRM", access: "admin", expiresInDays: 90, password: "x" }).success, false);
  assert.equal(apiKeyCreateSchema.safeParse({ name: "CRM", access: "read", expiresInDays: 9999, password: "x" }).success, false);
  assert.equal(apiKeyCreateSchema.safeParse({ name: "CRM", access: "read", expiresInDays: 90 }).success, false, "password required");
  assert.equal(apiKeyCreateSchema.safeParse({ name: "CRM", access: "read", expiresInDays: 90, password: "x", scopes: ["write"] }).success, false, "strict");
});

test("API cursor: round-trips, rejects anything that could inject into the filter", () => {
  const c = encodeCursor("2026-10-01T09:30:00.123Z", KEY_ID);
  assert.deepEqual(decodeCursor(c), { createdAt: "2026-10-01T09:30:00.123Z", id: KEY_ID });
  const evil = Buffer.from(`2026-10-01T09:30:00Z|${KEY_ID}),id.gt.(0`).toString("base64url");
  assert.equal(decodeCursor(evil), null);
  assert.equal(decodeCursor(Buffer.from(`2026-10-01T09:30:00Z,x|${KEY_ID}`).toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from(`2026-10-01T09:30:00Z|${KEY_ID}|x`).toString("base64url")), null);
  assert.equal(decodeCursor("not base64!"), null);
});

test("API query schema", () => {
  assert.equal(apiResponsesQuerySchema.safeParse({ limit: "20", since: "2026-10-01T00:00:00Z" }).success, true);
  assert.equal(apiResponsesQuerySchema.safeParse({ since: "2026-10-01" }).success, false, "needs a full date-time");
  assert.equal(apiResponsesQuerySchema.safeParse({ limit: "500" }).success, false);
  assert.equal(apiResponsesQuerySchema.safeParse({ since: "2026-10-02T00:00:00Z", until: "2026-10-01T00:00:00Z" }).success, false);
  assert.equal(apiResponsesQuerySchema.safeParse({ status: "pending" }).success, false, "pending clicks are never exposed");
  assert.equal(apiResponsesQuerySchema.safeParse({ cursor: "a,b" }).success, false);
});

test("API links: signed values survive the click link's own parsing, so ratings are verified", () => {
  const body = apiLinksSchema.parse({ email: " Amaya@Example.com ", agent: "  Nimal   Perera ", ticket: "T-1042" });
  const meta = { email: body.email ?? null, agent: body.agent ?? null, ticket: body.ticket ?? null };
  const sp = new URLSearchParams({ e: meta.email!, a: meta.agent!, t: meta.ticket!, s: signMetadata(SECRET, SURVEY, meta) });
  const parsed = parseClickParams(new URLSearchParams(sp.toString()));
  assert.equal(verifyMetadata([SECRET], SURVEY, { email: parsed.email, agent: parsed.agent, ticket: parsed.ticket }, parsed.metaSig), true);
  // Changing any detail breaks the signature.
  const tampered = new URLSearchParams(sp.toString());
  tampered.set("t", "T-9999");
  const p2 = parseClickParams(tampered);
  assert.equal(verifyMetadata([SECRET], SURVEY, { email: p2.email, agent: p2.agent, ticket: p2.ticket }, p2.metaSig), false);
  assert.equal(apiLinksSchema.safeParse({ agent: "{{agent.name}}" }).success, false);
  assert.equal(apiLinksSchema.safeParse({ ticket: "1 OR 1=1" }).success, false);
  assert.equal(apiLinksSchema.safeParse({ email: "nope" }).success, false);
  assert.equal(apiLinksSchema.safeParse({ extra: 1 }).success, false);
});

test("helpdesk: addresses can only be the provider's own domain", () => {
  assert.equal(helpdeskBaseUrl("zendesk", "acme"), "https://acme.zendesk.com");
  assert.throws(() => helpdeskBaseUrl("zendesk", "acme.evil.com/x"));
  assert.throws(() => helpdeskBaseUrl("freshdesk", "-acme"));
  assert.equal(checkIntegrationUrl("zendesk", "https://acme.zendesk.com").ok, true);
  assert.equal(checkIntegrationUrl("zendesk", "https://acme.zendesk.com.evil.io").ok, false);
  assert.equal(checkIntegrationUrl("freshdesk", "https://evil.com/.freshdesk.com").ok, false);
  assert.equal(checkIntegrationUrl("freshdesk", "https://acme.freshdesk.com").ok, true);
  const zd = helpdeskCreateSchema.safeParse({ kind: "zendesk", name: "ZD", subdomain: "Acme", email: "a@b.co", apiToken: "a".repeat(40), events: ["all"] });
  assert.equal(zd.success && zd.data.subdomain, "acme");
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "zendesk", name: "ZD", subdomain: "acme.zendesk.com", email: "a@b.co", apiToken: "a".repeat(40), events: ["all"] }).success, false);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "freshdesk", name: "FD", subdomain: "acme", apiKey: "abc def ghijk", events: ["all"] }).success, false);
});

test("helpdesk: notes are private, ticket ids numeric, Freshdesk HTML escaped", () => {
  assert.equal(ticketNumber("1042"), "1042");
  assert.equal(ticketNumber("#1042"), "1042");
  assert.equal(ticketNumber("T-1042"), null);
  assert.equal(ticketNumber("0"), null);
  assert.equal(ticketNumber(null), null);
  const base = { ratingLabel: "Poor", rating: 2, sentiment: "negative" as const, surveyName: "Support", agent: "Nimal", link: "https://app/x" };
  const text = noteText({ ...base, comment: '<img src=x onerror="alert(1)">' }, "comment");
  const fd = buildNoteRequest("freshdesk", "https://acme.freshdesk.com", helpdeskCredential({ kind: "freshdesk", apiKey: "KEY" }), "1042", text);
  assert.equal(fd.url, "https://acme.freshdesk.com/api/v2/tickets/1042/notes");
  const fdBody = JSON.parse(fd.body!) as { body: string; private: boolean };
  assert.equal(fdBody.private, true);
  assert.ok(!fdBody.body.includes("<img"), "customer HTML is escaped");
  assert.equal(fd.headers.Authorization, `Basic ${Buffer.from("KEY:X").toString("base64")}`);
  const zd = buildNoteRequest("zendesk", "https://acme.zendesk.com", helpdeskCredential({ kind: "zendesk", email: "a@b.co", apiToken: "TOK" }), "1042", noteText(base, "rating"));
  assert.equal(zd.method, "PUT");
  assert.equal((JSON.parse(zd.body!) as { ticket: { comment: { public: boolean } } }).ticket.comment.public, false);
  assert.equal(zd.headers.Authorization, `Basic ${Buffer.from("a@b.co/token:TOK").toString("base64")}`);
  assert.throws(() => buildNoteRequest("zendesk", "https://acme.zendesk.com", "c", "../users", "x"));
  assert.equal(buildCheckRequest("zendesk", "https://acme.zendesk.com", "c").method, "GET");
  assert.equal(checkResponseOk("zendesk", 200, { user: { id: null } }), false, "anonymous user = wrong credentials");
  assert.equal(checkResponseOk("zendesk", 200, { user: { id: 42 } }), true);
  assert.equal(checkResponseOk("freshdesk", 401, {}), false);
});

test("CSV: quotes, separators, blank lines, BOM", () => {
  const { rows } = parseCsv('﻿date,rating,comment\r\n2025-03-14,5,"Great, ""fast"" help"\r\n\r\n2025-03-15,1,"line1\nline2"\n');
  assert.deepEqual(rows, [
    ["date", "rating", "comment"],
    ["2025-03-14", "5", 'Great, "fast" help'],
    ["2025-03-15", "1", "line1\nline2"],
  ]);
  assert.deepEqual(parseCsv("date;rating\n2025-03-14;4").rows[1], ["2025-03-14", "4"], "semicolon (European Excel)");
  assert.equal(parseCsv("a\n1\n2\n3\n", 2).truncated, true);
  assert.deepEqual(detectColumns(["Created At", "Score", "Customer Email", "Feedback", "Agent", "Ticket ID"]), { date: 0, rating: 1, email: 2, comment: 3, agent: 4, ticket: 5 });
});

test("CSV: dates are strict and unambiguous", () => {
  assert.equal(parseDateCell("2025-03-14T09:30:00Z"), "2025-03-14T09:30:00Z");
  assert.equal(parseDateCell("2025-03-14T09:30:00+05:30"), "2025-03-14T04:00:00Z");
  assert.ok(parseDateCell("2025-03-14"));
  assert.ok(parseDateCell("2025/3/4 9:05"));
  assert.equal(parseDateCell("03/04/2025"), null, "day/month order is ambiguous");
  assert.equal(parseDateCell("2025-02-31"), null);
  assert.equal(parseDateCell("2025-13-01"), null);
  assert.equal(parseDateCell("yesterday"), null);
});

test("CSV: rows are checked against the survey's scale and the shared schema", () => {
  const mapping = { date: 0, rating: 1, email: 2, comment: 3 };
  assert.equal(checkRow(["2025-03-14T09:00:00Z", "5", "", ""], mapping, "faces5", 2).ok, true);
  const out = checkRow(["2025-03-14T09:00:00Z", "6", "", ""], mapping, "faces5", 3);
  assert.equal(out.ok, false);
  assert.ok(!out.ok && /outside/.test(out.problem.message) && out.problem.line === 3);
  assert.equal(checkRow(["2025-03-14T09:00:00Z", "4.5", "", ""], mapping, "faces5", 2).ok, false);
  assert.equal(checkRow(["2025-03-14T09:00:00Z", "4", "not-an-email", ""], mapping, "faces5", 2).ok, false);
  assert.equal(checkRow(["2099-03-14T09:00:00Z", "4", "", ""], mapping, "faces5", 2).ok, false, "future date");
  const r = checkRow(["2025-03-14T09:00:00Z", "4", " A@B.CO ", "  hi‮there "], mapping, "faces5", 2);
  assert.ok(r.ok && r.row.email === "a@b.co" && r.row.comment === "hithere", "same clean-up as everywhere else");
  const all = checkAll([["2025-03-14T09:00:00Z", "5"], ["bad", "5"]], { date: 0, rating: 1 }, "thumbs");
  assert.equal(all.valid.length, 0, "5 is outside thumbs (1-2)");
  assert.equal(all.problems.length, 2);
  assert.equal(importRowSchema.safeParse({ date: "2025-03-14T09:00:00Z", rating: 5, status: "confirmed" }).success, false, "strict");
});
