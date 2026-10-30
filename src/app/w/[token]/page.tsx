import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { verifyShareToken } from "@/lib/security/signing";
import { loadPublicSurvey, ratingLinks } from "@/lib/publicSurvey";
import { PublicRatingButtons } from "@/components/PublicRatingButtons";
import { HTML_LANG, pt } from "@/lib/i18n/public";
import { enforceSurveyHost } from "@/lib/surveyDomains";

export const metadata: Metadata = { title: "Rate us", robots: { index: false, follow: false } };

// Compact rating card meant to be embedded on a business's own website in an <iframe>.
// This path alone may be framed (see next.config.ts and middleware). Taps open the thank-you
// page in a new tab, where the rating is confirmed as usual.
export default async function WidgetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const surveyId = verifyShareToken(env().linkSecrets, token);
  if (!surveyId) notFound();
  const survey = await loadPublicSurvey(surveyId);
  if (!survey) notFound();
  await enforceSurveyHost(survey.accountId, `/w/${token}`);

  return (
    <main lang={HTML_LANG[survey.lang]} className="flex min-h-screen items-center justify-center bg-transparent p-3">
      <div className="w-full rounded-[16px] border border-line bg-surface px-4 py-5 text-center" style={{ borderTop: `3px solid ${survey.brandColor}` }}>
        <p className="font-display text-[17px] font-bold leading-snug">{survey.question}</p>
        {survey.active ? (
          <div className="mt-4">
            <PublicRatingButtons iconSet={survey.iconSet} links={ratingLinks(survey.id, survey.options, "web", null, survey.origin)} newTab compact lang={survey.lang} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{pt(survey.lang, "notCollectingShort")}</p>
        )}
        {survey.branding && (
          <p className="mt-3 text-[11px] text-muted">
            {pt(survey.lang, "feedbackBy")}{" "}
            <a href={env().appOrigin} target="_blank" rel="noopener noreferrer" className="font-semibold">
              TapTruly
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
