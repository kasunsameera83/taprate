import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGS, pt, standardLabel, SURVEY_DEFAULTS } from "../../src/lib/i18n/public.ts";
import { resolveOptions } from "../../src/lib/surveys/customIcons.ts";
import { buildSnippetHtml } from "../../src/lib/surveys/snippet.ts";
import { buildSurveyEmail } from "../../src/lib/sending/emailTemplate.ts";
import { surveyCreateSchema, driverLabel } from "../../src/lib/validation/schemas.ts";
import { ICON_SETS } from "../../src/lib/surveys/iconSets.ts";

test("every standard label has a Sinhala and Tamil version", () => {
  for (const set of Object.values(ICON_SETS)) {
    for (const o of set.options) {
      for (const lang of LANGS) {
        const l = standardLabel(set.id, o.value, lang);
        assert.ok(l.length > 0 && l.length <= 24, `${set.id} ${o.value} ${lang}`);
        if (lang !== "en" && set.id !== "nps") assert.notEqual(l, o.label, `${set.id} ${o.value} ${lang} is translated`);
      }
    }
  }
});

test("own labels win over translated ones; placeholders are filled", () => {
  const opts = resolveOptions("faces5", { labels: { "5": "Perfect brew" } }, "si");
  assert.equal(opts[4]!.label, "Perfect brew");
  assert.equal(opts[0]!.label, standardLabel("faces5", 1, "si"));
  assert.match(pt("ta", "sentBy", { business: "Kova" }), /^Kova /);
  assert.equal(pt("en", "goTo", { host: "kova.lk" }), "Go to kova.lk");
});

test("email buttons and survey email use the survey's language, escaped", () => {
  const html = buildSnippetHtml({
    appUrl: "https://app.taprate.lk",
    surveyId: "5a000000-0000-4000-8000-000000000001",
    iconSet: "nps",
    question: "Q",
    brandColor: "#2f3bf5",
    mergeTags: { email: "", agent: "", ticket: "" },
    signToken: () => "5a000000-0000-4000-8000-000000000001.1.AAAAAAAAAAAAAAAAAAAAAA",
    lang: "si",
  });
  assert.ok(html.includes(pt("si", "npsLow")));
  assert.ok(html.includes(`${pt("si", "rate")}: 0`));
  const mail = buildSurveyEmail({ businessName: "<Kova>", logoUrl: null, subject: "S", intro: "x", recipientName: null, buttonsHtml: "", buttonLinks: [], unsubscribeUrl: "https://x/u", reminder: true, lang: "ta" });
  assert.ok(mail.subject.startsWith(pt("ta", "reminderPrefix")));
  assert.ok(mail.html.includes("&lt;Kova&gt;"));
  assert.doesNotMatch(mail.html, /<Kova>/);
});

test("default texts in each language pass the same validation as typed ones", () => {
  for (const lang of LANGS) {
    const d = SURVEY_DEFAULTS[lang];
    const r = surveyCreateSchema.safeParse({
      name: "S", question: d.question, iconSet: "faces5", brandColor: "#2f3bf5", thankYouMessage: d.thanks, allowComment: true,
      websiteUrl: null, alertThreshold: null, alertEmails: [], driversPositive: d.positive, driversNegative: d.negative, language: lang,
    });
    assert.equal(r.success, true, lang);
    for (const l of [...d.positive, ...d.negative]) assert.equal(driverLabel.safeParse(l).success, true);
  }
  assert.equal(surveyCreateSchema.safeParse({ name: "S", question: "Q", iconSet: "faces5", brandColor: "#2f3bf5", thankYouMessage: "T", allowComment: true, websiteUrl: null, alertThreshold: null, alertEmails: [], language: "fr" }).success, false);
});

import { detectColumns, parseDateCell } from "../../src/lib/csvImport.ts";
test("import: exports from other tools are recognised (Delighted-style headers, Unix times)", () => {
  const m = detectColumns(["Response ID", "Score", "Comment", "Response timestamp (UTC)", "Person email", "Name"]);
  assert.equal(m.rating, 1);
  assert.equal(m.comment, 2);
  assert.equal(m.date, 3);
  assert.equal(m.email, 4);
  assert.equal(parseDateCell("1684077721"), "2023-05-14T15:22:01Z");
  assert.equal(parseDateCell("1684077721000"), "2023-05-14T15:22:01Z");
  assert.equal(parseDateCell("2023-05-14 10:22:01 -0700"), "2023-05-14T17:22:01Z");
  assert.equal(parseDateCell("14/05/2023"), null);
});

import { sampleStats } from "../../src/lib/onboarding/sample.ts";
test("sample dashboard data is believable and the same every time", () => {
  const a = sampleStats(30, Date.parse("2026-10-28T00:00:00Z"));
  const b = sampleStats(30, Date.parse("2026-10-28T00:00:00Z"));
  assert.deepEqual(a, b);
  assert.ok(a.total > 100 && a.satisfactionPct! > 60 && a.satisfactionPct! < 95);
  assert.equal(a.byAgent.length, 4);
  assert.equal(a.recent.length, 60);
});
