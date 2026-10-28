import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { verifyLocationTag, verifyShareToken } from "@/lib/security/signing";
import { LINK_CHANNELS, type Channel } from "@/lib/validation/schemas";
import { loadPublicSurvey, ratingLinks } from "@/lib/publicSurvey";
import { PublicRatingButtons } from "@/components/PublicRatingButtons";
import { HTML_LANG, pt } from "@/lib/i18n/public";

export const metadata: Metadata = { title: "Rate us", robots: { index: false, follow: false } };

// Public rating page for QR codes, WhatsApp/SMS messages and plain links. The link is signed, so only
// surveys a business chose to share can be opened. Each button is the normal signed one-tap link,
// so scanner protection, de-duplication and rate limits all apply as for email.
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const c = sp.c;
  const surveyId = verifyShareToken(env().linkSecrets, token);
  if (!surveyId) notFound();
  const survey = await loadPublicSurvey(surveyId);
  if (!survey) notFound();
  const channel = (typeof c === "string" && (LINK_CHANNELS as readonly string[]).includes(c) ? c : "link") as Exclude<Channel, "kiosk" | "email">;
  // A branch's QR code: the tag is signed for this survey, and the database checks the branch again.
  const locationId = typeof sp.l === "string" ? verifyLocationTag(env().linkSecrets, surveyId, sp.l) : null;

  return (
    <div lang={HTML_LANG[survey.lang]} className="min-h-screen" style={{ background: `linear-gradient(180deg, ${survey.brandColor}14 0, transparent 260px)` }}>
      <div className="h-1.5" style={{ background: survey.brandColor }} />
      <main className="mx-auto flex max-w-lg flex-col px-5 pb-10 pt-10 sm:pt-16">
        {survey.logo ? (
          <img src={survey.logo} alt={survey.business || "Business logo"} className="mx-auto max-h-14 max-w-[200px] object-contain" />
        ) : (
          survey.business && <p className="text-center text-sm font-semibold text-muted">{survey.business}</p>
        )}
        <div className="mt-4 rounded-[var(--radius-hero)] border border-line bg-surface px-5 py-8 text-center shadow-[0_1px_2px_rgba(21,26,45,0.04)] sm:px-8">
          <h1 className="text-[24px] font-bold leading-snug">{survey.question}</h1>
          {survey.active ? (
            <>
              <p className="mt-1 text-sm text-muted">{pt(survey.lang, "tapOne")}</p>
              <div className="mt-6">
                <PublicRatingButtons iconSet={survey.iconSet} links={ratingLinks(survey.id, survey.options, channel, locationId)} lang={survey.lang} />
              </div>
            </>
          ) : (
            <p className="mt-4 text-muted">{pt(survey.lang, "notCollecting")}</p>
          )}
        </div>
        <p className="mt-10 text-center text-[12px] text-muted">
          {pt(survey.lang, "feedbackBy")} <span className="font-semibold">TapTruly</span> ·{" "}
          <a href="/privacy" className="underline underline-offset-2">
            {pt(survey.lang, "privacy")}
          </a>
        </p>
      </main>
    </div>
  );
}
