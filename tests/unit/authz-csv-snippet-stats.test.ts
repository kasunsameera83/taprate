import { test } from "node:test";
import assert from "node:assert/strict";
import { canPerform, ACTIONS } from "../../src/lib/security/authz.ts";
import { csvCell, toCsv } from "../../src/lib/security/csv.ts";
import { buildSnippetHtml, buildClickUrl } from "../../src/lib/surveys/snippet.ts";
import { computeStats } from "../../src/lib/surveys/stats.ts";
import { isValidRating, sentimentOf } from "../../src/lib/surveys/iconSets.ts";
import { buildLinkToken } from "../../src/lib/security/signing.ts";

test("permission matrix", () => {
  for (const a of ACTIONS) assert.equal(canPerform("owner", a), true, `owner ${a}`);
  assert.equal(canPerform("admin", "survey:write"), true);
  assert.equal(canPerform("admin", "account:write"), false);
  assert.equal(canPerform("viewer", "survey:read"), true);
  assert.equal(canPerform("viewer", "survey:write"), false);
  assert.equal(canPerform("viewer", "response:export"), false);
  assert.equal(canPerform("superadmin", "survey:read"), false);
  assert.equal(canPerform(undefined, "survey:read"), false);
  assert.equal(canPerform("__proto__", "survey:read"), false);
  // Agents: read-only, and never team, export, privacy or audit actions.
  assert.equal(canPerform("agent", "response:read"), true);
  for (const action of ["survey:write", "response:export", "team:read", "team:write", "privacy:erase", "audit:read", "account:delete", "account:export"] as const) {
    assert.equal(canPerform("agent", action), false, `agent ${action}`);
    assert.equal(canPerform("viewer", action), false, `viewer ${action}`);
  }
  // Admins manage the team but can't delete or export the whole account.
  assert.equal(canPerform("admin", "team:write"), true);
  assert.equal(canPerform("admin", "account:delete"), false);
  assert.equal(canPerform("admin", "account:export"), false);
});

test("CSV neutralises spreadsheet formulas", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://evil\")"), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell("+1+1"), `"'+1+1"`);
  assert.equal(csvCell("-2"), `"'-2"`);
  assert.equal(csvCell("@SUM(A1)"), `"'@SUM(A1)"`);
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(null), "");
  const csv = toCsv([{ a: "x", b: 1 }], [{ key: "a", header: "A" }, { key: "b", header: "B" }]);
  assert.equal(csv, "﻿A,B\r\nx,1\r\n");
});

test("rating ranges per scale", () => {
  assert.equal(isValidRating("faces5", 5), true);
  assert.equal(isValidRating("faces5", 6), false);
  assert.equal(isValidRating("faces5", 0), false);
  assert.equal(isValidRating("nps", 0), true);
  assert.equal(isValidRating("nps", 10), true);
  assert.equal(isValidRating("thumbs", 3), false);
  assert.equal(isValidRating("faces3", 2.5), false);
});

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const SURVEY = "5a000000-0000-4000-8000-000000000001";

test("snippet: one signed link per rating, question escaped", () => {
  const html = buildSnippetHtml({
    appUrl: "https://app.example/",
    surveyId: SURVEY,
    iconSet: "faces5",
    question: `How did we do? <script>alert(1)</script>`,
    brandColor: "#2563eb",
    mergeTags: { email: "{{ticket.requester.email}}", agent: "", ticket: "{{ticket.id}}" },
    signToken: (id, r) => buildLinkToken(SECRET, id, r),
  });
  assert.equal((html.match(/<a /g) ?? []).length, 5);
  assert.ok(html.includes('aria-label="Rate: Excellent"'), "descriptive link labels");
  assert.ok(html.includes(">Excellent</span>"), "text label, not colour alone");
  assert.ok(!/<img/i.test(html), "no images (blocked by many mail clients)");
  assert.ok(html.includes('bgcolor="#ffffff"'), "explicit background for dark mode");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes(`https://app.example/r/${buildLinkToken(SECRET, SURVEY, 5)}?e={{ticket.requester.email}}&amp;t={{ticket.id}}`));
});

test("snippet refuses dangerous merge tags and colours", () => {
  const base = {
    appUrl: "https://app.example",
    surveyId: SURVEY,
    iconSet: "thumbs" as const,
    question: "Q",
    brandColor: "#2563eb",
    signToken: (id: string, r: number) => buildLinkToken(SECRET, id, r),
  };
  assert.throws(() => buildSnippetHtml({ ...base, mergeTags: { email: `"><script>`, agent: "", ticket: "" } }));
  assert.throws(() => buildSnippetHtml({ ...base, mergeTags: { email: "", agent: "a&b=c", ticket: "" } }));
  assert.throws(() => buildSnippetHtml({ ...base, brandColor: "red;background:url(x)", mergeTags: { email: "", agent: "", ticket: "" } }));
});

test("click URL without merge tags has no query string", () => {
  assert.equal(buildClickUrl("https://a.example", "tok", { email: "", agent: "", ticket: "" }), "https://a.example/r/tok");
});

test("stats: satisfaction, sentiment, NPS, agents, continuous days, previous period", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const rows = [
    { rating: 5, iconSet: "faces5" as const, createdAt: "2026-10-27T09:00:00Z", agent: "Sarah" },
    { rating: 4, iconSet: "faces5" as const, createdAt: "2026-10-27T10:00:00Z", agent: "Sarah" },
    { rating: 2, iconSet: "faces5" as const, createdAt: "2026-10-25T10:00:00Z", agent: "Bob" },
    { rating: 10, iconSet: "nps" as const, createdAt: "2026-10-26T10:00:00Z", agent: null },
    { rating: 8, iconSet: "nps" as const, createdAt: "2026-10-26T11:00:00Z", agent: null },
    { rating: 3, iconSet: "nps" as const, createdAt: "2026-10-26T12:00:00Z", agent: null },
  ];
  const previous = [
    { rating: 1, iconSet: "faces5" as const, createdAt: "2026-10-15T09:00:00Z", agent: "Bob" },
    { rating: 5, iconSet: "faces5" as const, createdAt: "2026-10-16T09:00:00Z", agent: "Bob" },
  ];
  const s = computeStats(rows, previous, { days: 7, now });
  assert.equal(s.total, 6);
  assert.equal(s.positive, 3);
  assert.equal(s.neutral, 1);
  assert.equal(s.negative, 2);
  assert.equal(s.satisfactionPct, 50);
  assert.deepEqual(s.nps, { score: 0, promoters: 1, passives: 1, detractors: 1, total: 3 });
  assert.equal(s.previous.total, 2);
  assert.equal(s.previous.satisfactionPct, 50);
  assert.equal(s.byDay.length, 7);
  assert.deepEqual(s.byDay[6], { date: "2026-10-27", total: 2, positive: 2, neutral: 0, negative: 0 });
  assert.deepEqual(s.byDay[5], { date: "2026-10-26", total: 3, positive: 1, neutral: 1, negative: 1 });
  assert.equal(s.byDay[0]?.total, 0);
  assert.deepEqual(s.byAgent[0], { agent: "Sarah", total: 2, satisfactionPct: 100, negative: 0 });
  assert.deepEqual(s.byAgent[1], { agent: "Bob", total: 1, satisfactionPct: 0, negative: 1 });
  assert.equal(s.recent.length, 6);
  assert.equal(s.recent[0]?.createdAt, "2026-10-27T10:00:00Z", "newest first");
  assert.equal(s.recent.at(-1)?.sentiment, "negative");
  const empty = computeStats([], [], { days: 7, now });
  assert.equal(empty.satisfactionPct, null);
  assert.equal(empty.nps, null);
  assert.equal(empty.previous.satisfactionPct, null);
});

test("sentiment thresholds match the database function", () => {
  const cases: Array<[Parameters<typeof sentimentOf>[0], number, string]> = [
    ["faces5", 5, "positive"], ["faces5", 4, "positive"], ["faces5", 3, "neutral"], ["faces5", 2, "negative"],
    ["stars5", 1, "negative"], ["faces3", 3, "positive"], ["faces3", 2, "neutral"], ["faces3", 1, "negative"],
    ["thumbs", 2, "positive"], ["thumbs", 1, "negative"],
    ["nps", 10, "positive"], ["nps", 9, "positive"], ["nps", 8, "neutral"], ["nps", 7, "neutral"], ["nps", 6, "negative"], ["nps", 0, "negative"],
  ];
  for (const [set, rating, expected] of cases) assert.equal(sentimentOf(set, rating), expected, `${set} ${rating}`);
});
