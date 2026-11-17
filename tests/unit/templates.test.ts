import { test } from "node:test";
import assert from "node:assert/strict";
import { SURVEY_TEMPLATES, templateById, templateSurvey, isChannel, isTemplateId } from "../../src/lib/surveys/templates.ts";
import { surveyCreateSchema } from "../../src/lib/validation/schemas.ts";

test("every ready-made survey is valid in every language, with and without an alert email", () => {
  for (const t of SURVEY_TEMPLATES) {
    for (const lang of ["en", "si", "ta"] as const) {
      for (const email of ["owner@example.lk", null]) {
        const r = surveyCreateSchema.safeParse(templateSurvey(t, lang, email));
        assert.ok(r.success, `${t.id}/${lang}/${email}: ${r.success ? "" : JSON.stringify(r.error.issues)}`);
      }
    }
  }
});

test("alerts are only on when there's someone to tell", () => {
  const t = templateById("visit");
  assert.deepEqual(templateSurvey(t, "en", "a@b.lk").alertEmails, ["a@b.lk"]);
  assert.equal(templateSurvey(t, "en", null).alertThreshold, null);
  assert.equal(templateSurvey(t, "si", null).language, "si");
});

test("ids are checked", () => {
  assert.equal(isTemplateId("visit"), true);
  assert.equal(isTemplateId("<script>"), false);
  assert.equal(isChannel("whatsapp"), true);
  assert.equal(isChannel("fax"), false);
});
