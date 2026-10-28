import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecipientText } from "../../src/lib/sending/recipients.ts";
import { buildSurveyEmail, fillPlaceholders, safeFromName } from "../../src/lib/sending/emailTemplate.ts";
import { sendCreateSchema, apiSendSchema } from "../../src/lib/validation/sending.ts";
import { signSvix, verifySvixSignature } from "../../src/lib/security/svix.ts";
import { buildSnippetHtml } from "../../src/lib/surveys/snippet.ts";

test("recipients: plain lines, names in angle brackets, duplicates and bad lines", () => {
  const r = parseRecipientText("amaya@gmail.com\nRuwan Silva <Ruwan@Company.lk>\nnot-an-email\nAMAYA@gmail.com\nnimal@x.lk, Nimal\n");
  assert.deepEqual(
    r.recipients.map((x) => x.email),
    ["amaya@gmail.com", "ruwan@company.lk", "nimal@x.lk"],
  );
  assert.equal(r.recipients[1]!.name, "Ruwan Silva");
  assert.equal(r.recipients[2]!.name, "Nimal");
  assert.equal(r.duplicates, 1);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0]!.line, 3);
});

test("recipients: CSV with headers in any order keeps agent and ticket", () => {
  const r = parseRecipientText("Name,Ticket ID,E-mail,Agent\nAmaya,T-1,amaya@gmail.com,Kumari\n,,,\nBad,T-2,bad@,Kumari\n");
  assert.equal(r.recipients.length, 1);
  assert.deepEqual(r.recipients[0], { email: "amaya@gmail.com", name: "Amaya", agent: "Kumari", ticket: "T-1" });
  assert.equal(r.problems.length, 1);
});

test("recipients: markup and bad tickets are refused; the limit is applied", () => {
  const r = parseRecipientText("email,name,ticket\na@x.lk,<script>,1\nb@x.lk,Bee,two words\n");
  assert.equal(r.recipients.length, 0);
  assert.equal(r.problems.length, 2);
  const many = parseRecipientText(Array.from({ length: 12 }, (_, i) => `p${i}@x.lk`).join("\n"), 10);
  assert.equal(many.recipients.length, 10);
  assert.equal(many.tooMany, true);
});

test("send form: consent, limits and reply-to are enforced", () => {
  const base = { name: "Oct", subject: "How did we do?", intro: "Hi {name}", replyTo: "", reminderDays: 3, skipRecentDays: 30, recipients: [{ email: "a@x.lk" }], confirmCustomers: true };
  assert.equal(sendCreateSchema.safeParse(base).success, true);
  assert.equal(sendCreateSchema.safeParse({ ...base, confirmCustomers: false }).success, false);
  assert.equal(sendCreateSchema.safeParse({ ...base, reminderDays: 1 }).success, false);
  assert.equal(sendCreateSchema.safeParse({ ...base, skipRecentDays: 15 }).success, false);
  assert.equal(sendCreateSchema.safeParse({ ...base, replyTo: "x@y.lk>\nBcc: z@z.lk" }).success, false);
  assert.equal(sendCreateSchema.safeParse({ ...base, recipients: [] }).success, false);
  assert.equal(sendCreateSchema.safeParse({ ...base, recipients: Array.from({ length: 1001 }, (_, i) => ({ email: `p${i}@x.lk` })) }).success, false);
  assert.equal(sendCreateSchema.safeParse({ ...base, extra: 1 }).success, false);
  const s = sendCreateSchema.parse({ ...base, subject: "Hi\nBcc: evil@x.com" });
  assert.doesNotMatch(s.subject, /\n/);
  assert.equal(apiSendSchema.safeParse({ email: "a@x.lk", skip_recent_days: 400 }).success, false);
});

test("email: everything typed is escaped, placeholders filled, footer has unsubscribe", () => {
  const mail = buildSurveyEmail({
    businessName: 'Kova <script>alert(1)</script> & Co',
    logoUrl: "https://evil.example/logo.png",
    subject: "How did we do?",
    intro: "Hi {name},\n\n<img src=x onerror=alert(1)> thanks from {business}",
    recipientName: "Amaya Perera",
    buttonsHtml: "<table>buttons</table>",
    buttonLinks: [{ label: "Excellent", url: "https://app.taprate.lk/r/x" }],
    unsubscribeUrl: "https://app.taprate.lk/unsubscribe?r=1&t=2",
    reminder: true,
  });
  assert.equal(mail.subject, "Reminder: How did we do?");
  assert.doesNotMatch(mail.html, /<script>|<img src=x/);
  assert.match(mail.html, /Hi Amaya,/);
  assert.match(mail.html, /&lt;img src=x/);
  assert.doesNotMatch(mail.html, /evil\.example/); // only our own storage logos
  assert.match(mail.html, /unsubscribe\?r=1&amp;t=2/);
  assert.match(mail.text, /Excellent: https:\/\/app\.taprate\.lk\/r\/x/);
  assert.equal(fillPlaceholders("Hi {name}", null, "Kova"), "Hi there");
  assert.equal(safeFromName('Kova "Café" <x@y>\r\nBcc: z'), "Kova Café x y Bcc z");
});

test("snippet: per-recipient links are used when given", () => {
  const html = buildSnippetHtml({
    appUrl: "https://app.taprate.lk",
    surveyId: "5a000000-0000-4000-8000-000000000001",
    iconSet: "thumbs",
    question: "Q",
    brandColor: "#2f3bf5",
    mergeTags: { email: "", agent: "", ticket: "" },
    signToken: () => "unused",
    urlFor: (r) => `https://app.taprate.lk/r/tok${r}?e=a%40x.lk&s=sig`,
  });
  assert.match(html, /tok1\?e=a%40x\.lk&amp;s=sig/);
  assert.doesNotMatch(html, /unused/);
});

test("svix: valid signature passes; tampering, replay and wrong secret fail", () => {
  const secret = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
  const now = 1_800_000_000;
  const body = '{"type":"email.bounced"}';
  const sig = signSvix(secret, "msg_1", String(now), body);
  const h = { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` };
  assert.equal(verifySvixSignature(secret, h, body, now), true);
  assert.equal(verifySvixSignature(secret, { ...h, signature: `v1,bad v1,${sig}` }, body, now), true);
  assert.equal(verifySvixSignature(secret, h, body + " ", now), false);
  assert.equal(verifySvixSignature(secret, h, body, now + 301), false);
  assert.equal(verifySvixSignature("whsec_" + Buffer.from("x".repeat(32)).toString("base64"), h, body, now), false);
  assert.equal(verifySvixSignature(secret, { ...h, signature: null }, body, now), false);
});

import { buildLocationTag, verifyLocationTag } from "../../src/lib/security/signing.ts";
test("branch tags: bound to one survey and one branch, can't be forged", () => {
  const secret = "s".repeat(40);
  const survey = "5a000000-0000-4000-8000-000000000001";
  const other = "5a000000-0000-4000-8000-000000000002";
  const loc = "7b000000-0000-4000-8000-000000000001";
  const tag = buildLocationTag(secret, survey, loc);
  assert.equal(verifyLocationTag([secret], survey, tag), loc);
  assert.equal(verifyLocationTag([secret], other, tag), null, "tag from another survey");
  assert.equal(verifyLocationTag([secret], survey, tag.replace(loc, "7b000000-0000-4000-8000-000000000002")), null, "branch swapped");
  assert.equal(verifyLocationTag(["t".repeat(40)], survey, tag), null, "wrong secret");
  assert.equal(verifyLocationTag([secret], survey, "x"), null);
});

import { buildWallToken, verifyWallToken } from "../../src/lib/security/signing.ts";
test("testimonial wall links: signed per business", () => {
  const secret = "w".repeat(40);
  const acc = "0f1e2d3c-4b5a-4968-8776-655443322110";
  const tok = buildWallToken(secret, acc);
  assert.equal(verifyWallToken([secret], tok), acc);
  assert.equal(verifyWallToken([secret], tok.replace(acc, "0f1e2d3c-4b5a-4968-8776-655443322111")), null);
  assert.equal(verifyWallToken(["z".repeat(40)], tok), null);
});

import { buildRecoveryTag, verifyRecoveryTag } from "../../src/lib/security/signing.ts";
test("recovery links: bound to one survey and one original rating", () => {
  const secret = "r".repeat(40);
  const survey = "5a000000-0000-4000-8000-000000000001";
  const resp = "6c000000-0000-4000-8000-000000000001";
  const tag = buildRecoveryTag(secret, survey, resp);
  assert.equal(verifyRecoveryTag([secret], survey, tag), resp);
  assert.equal(verifyRecoveryTag([secret], "5a000000-0000-4000-8000-000000000002", tag), null);
  assert.equal(verifyRecoveryTag([secret], survey, tag.replace(resp, "6c000000-0000-4000-8000-000000000002")), null);
});

import { cleanRecords, sendingDomainSchema } from "../../src/lib/sending/domainRules.ts";
test("own sending domain: real business domains only; provider records cleaned", () => {
  assert.equal(sendingDomainSchema.parse({ domain: "https://Mail.Kova.lk/" }).domain, "mail.kova.lk");
  assert.equal(sendingDomainSchema.safeParse({ domain: "gmail.com" }).success, false);
  assert.equal(sendingDomainSchema.safeParse({ domain: "localhost" }).success, false);
  assert.equal(sendingDomainSchema.safeParse({ domain: "x.taprate.lk" }).success, false);
  assert.equal(sendingDomainSchema.safeParse({ domain: "kova.lk", fromLocal: "a b" }).success, false);
  const recs = cleanRecords([{ record: "DKIM", type: "TXT", name: "resend._domainkey", value: "p=abc", status: "not_started" }, { type: "A", name: "x", value: "1.2.3.4" }, { type: "TXT", name: "<script>", value: "x" }]);
  assert.equal(recs.length, 1);
  assert.equal(recs[0]!.purpose, "DKIM");
});
