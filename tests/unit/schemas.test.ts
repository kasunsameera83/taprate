// Needs dependencies installed (zod): run with `npm test` after `npm install`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signUpSchema,
  signInSchema,
  surveyCreateSchema,
  surveyUpdateSchema,
  responsesQuerySchema,
  statsQuerySchema,
  publicCommentSchema,
  publicConfirmSchema,
  parseClickParams,
  cleanText,
} from "../../src/lib/validation/schemas.ts";

const validSurvey = {
  name: "Support CSAT",
  question: "How did we do?",
  iconSet: "faces5",
  brandColor: "#2563eb",
  thankYouMessage: "Thanks!",
  allowComment: true,
  websiteUrl: null,
  alertThreshold: 2,
  alertEmails: ["boss@example.com"],
};

test("sign up: valid input passes, email normalised", () => {
  const r = signUpSchema.safeParse({ email: "  Owner@Example.COM ", password: "correct-horse-1", accountName: " Acme  Ltd " });
  assert.ok(r.success);
  assert.equal(r.data.email, "owner@example.com");
  assert.equal(r.data.accountName, "Acme Ltd");
});

test("sign up: weak passwords, bad emails and extra fields are rejected", () => {
  const base = { email: "a@b.com", password: "correct-horse-1", accountName: "Acme" };
  assert.equal(signUpSchema.safeParse({ ...base, password: "short1" }).success, false);
  assert.equal(signUpSchema.safeParse({ ...base, password: "aaaaaaaaaaaa" }).success, false);
  assert.equal(signUpSchema.safeParse({ ...base, password: "onlyletterslong" }).success, false);
  assert.equal(signUpSchema.safeParse({ ...base, password: "x".repeat(129) + "1" }).success, false);
  assert.equal(signUpSchema.safeParse({ ...base, email: "not-an-email" }).success, false);
  assert.equal(signUpSchema.safeParse({ ...base, accountName: "   " }).success, false);
  assert.equal(signUpSchema.safeParse({ ...base, role: "owner" }).success, false, "unknown field");
  assert.equal(signUpSchema.safeParse({ ...base, accountName: 123 }).success, false, "wrong type");
});

test("sign in: rejects non-strings and oversized input", () => {
  assert.equal(signInSchema.safeParse({ email: "a@b.com", password: { $gt: "" } }).success, false);
  assert.equal(signInSchema.safeParse({ email: ["a@b.com"], password: "x" }).success, false);
  assert.equal(signInSchema.safeParse({ email: "a@b.com", password: "x".repeat(200) }).success, false);
});

test("survey create: valid", () => {
  const r = surveyCreateSchema.safeParse(validSurvey);
  assert.ok(r.success);
  assert.equal(r.data.status, "active");
});

test("survey create: rejects bad values", () => {
  const bad: Array<[string, unknown]> = [
    ["iconSet", "hearts"],
    ["brandColor", "red"],
    ["brandColor", "#2563eb;background:url(x)"],
    ["websiteUrl", "javascript:alert(1)"],
    ["websiteUrl", "http://insecure.example"],
    ["websiteUrl", "https://user:pass@example.com"],
    ["alertThreshold", 9],
    ["alertThreshold", 1.5],
    ["alertEmails", ["a@b.com", "a@b.com"]],
    ["alertEmails", Array.from({ length: 11 }, (_, i) => `a${i}@b.com`)],
    ["question", "x".repeat(201)],
    ["name", ""],
    ["allowComment", "yes"],
  ];
  for (const [field, value] of bad) {
    assert.equal(surveyCreateSchema.safeParse({ ...validSurvey, [field]: value }).success, false, `${field}=${JSON.stringify(value).slice(0, 40)}`);
  }
  assert.equal(surveyCreateSchema.safeParse({ ...validSurvey, account_id: "x" }).success, false, "unknown field");
});

test("survey update: partial, strict, non-empty", () => {
  assert.ok(surveyUpdateSchema.safeParse({ name: "New" }).success);
  assert.equal(surveyUpdateSchema.safeParse({}).success, false);
  assert.equal(surveyUpdateSchema.safeParse({ accountId: "x" }).success, false);
  assert.equal(surveyUpdateSchema.safeParse({ status: "deleted" }).success, false);
});

test("query schemas coerce and bound values", () => {
  const q = responsesQuerySchema.safeParse({ page: "2", limit: "50", rating: "4" });
  assert.ok(q.success);
  assert.equal(q.data.page, 2);
  assert.equal(responsesQuerySchema.safeParse({ limit: "1000" }).success, false);
  assert.equal(responsesQuerySchema.safeParse({ from: "2026-10-10", to: "2026-10-01" }).success, false);
  assert.equal(responsesQuerySchema.safeParse({ from: "yesterday" }).success, false);
  assert.equal(responsesQuerySchema.safeParse({ surveyId: "1 or 1=1" }).success, false);
  assert.equal(statsQuerySchema.safeParse({ days: "30" }).success, true);
  assert.equal(statsQuerySchema.safeParse({ days: "31" }).success, false);
});

test("public comment: cleaned, bounded, honeypot enforced", () => {
  const base = { responseId: "7c000000-0000-4000-8000-000000000003", token: `1800000000.${"A".repeat(22)}` };
  const r = publicCommentSchema.safeParse({ ...base, comment: "  Great\u0000 service‮!  " });
  assert.ok(r.success);
  assert.equal(r.data.comment, "Great service!");
  assert.equal(publicCommentSchema.safeParse({ ...base, comment: "   " }).success, false);
  assert.equal(publicCommentSchema.safeParse({ ...base, comment: "x".repeat(2001) }).success, false);
  assert.equal(publicCommentSchema.safeParse({ ...base, comment: "hi", website: "spam.com" }).success, false);
  assert.equal(publicConfirmSchema.safeParse({ ...base, token: "nope" }).success, false);
});

test("click params: invalid optional values are dropped, not trusted", () => {
  const p = (q: string) => parseClickParams(new URLSearchParams(q));
  assert.deepEqual(p("e=C%40X.com&a=Sarah&t=T-1"), { email: "c@x.com", agent: "Sarah", ticket: "T-1", metaSig: null });
  assert.equal(p("e={{ticket.requester.email}}").email, null, "unreplaced merge tag");
  assert.equal(p("e=not-an-email").email, null);
  assert.equal(p("e=a@b.com&e=c@d.com").email, null, "duplicate param");
  assert.equal(p("t=<script>").ticket, null);
  assert.equal(p(`a=${"x".repeat(150)}`).agent, null);
  assert.equal(p("s=short").metaSig, null);
});

test("cleanText strips control and bidi characters", () => {
  assert.equal(cleanText("a\u0007b‮c"), "abc");
  assert.equal(cleanText("  a \n\t b  "), "a b");
  assert.equal(cleanText("line1\r\nline2", { multiline: true }), "line1\nline2");
});

test("phase 1 schemas: passwords, 2FA codes, invites, deletion", async () => {
  const s = await import("../../src/lib/validation/schemas.ts");
  assert.ok(s.newPasswordSchema.safeParse({ newPassword: "correct-horse-1" }).success);
  assert.equal(s.newPasswordSchema.safeParse({ newPassword: "short" }).success, false);
  assert.equal(s.newPasswordSchema.safeParse({ newPassword: "correct-horse-1", isAdmin: true }).success, false, "strict");

  const code = s.mfaCodeSchema.safeParse({ code: "123 456" });
  assert.ok(code.success);
  assert.equal(code.data.code, "123456");
  for (const bad of ["12345", "1234567", "abcdef", "", "12 34 5"]) {
    assert.equal(s.mfaCodeSchema.safeParse({ code: bad }).success, false, bad);
  }
  assert.equal(s.mfaConfirmSchema.safeParse({ factorId: "nope", code: "123456" }).success, false);

  assert.ok(s.inviteCreateSchema.safeParse({ email: "A@B.com", role: "viewer" }).success);
  assert.equal(s.inviteCreateSchema.safeParse({ email: "a@b.com", role: "owner" }).success, false, "can't invite owners");
  assert.equal(s.inviteCreateSchema.safeParse({ email: "a@b.com", role: "agent" }).success, false, "agent needs a name");
  assert.ok(s.inviteCreateSchema.safeParse({ email: "a@b.com", role: "agent", agentName: " Kasun " }).success);
  assert.equal(s.memberUpdateSchema.safeParse({ role: "superuser" }).success, false);

  assert.equal(s.deleteAccountSchema.safeParse({ confirmName: "", password: "x" }).success, false);
  assert.equal(s.accountSwitchSchema.safeParse({ accountId: "1 or 1=1" }).success, false);
  assert.equal(s.eraseCustomerSchema.safeParse({ email: "not-email" }).success, false);
});
