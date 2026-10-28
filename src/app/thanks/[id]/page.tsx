import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { isUuid, verifyResponseToken } from "@/lib/security/signing";
import { isIconSetId, ratingOption, sentimentOf } from "@/lib/surveys/iconSets";
import { ThanksClient } from "./ThanksClient";
import { logoUrl } from "@/lib/branding";
import { iconUrlMap, labelsFor, resolveOptions } from "@/lib/surveys/customIcons";
import { HTML_LANG, isLang, pt, type Lang, type PublicKey } from "@/lib/i18n/public";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };

// Words the thank-you page's interactive part needs, in the survey's language.
const THANKS_KEYS = ["shareName", "shareHint", "notCollecting", "saveFailed", "savingRating", "ratingSaved", "tapAny", "saving", "saved", "couldntSave", "commentThanks", "yourComment", "editComment", "tellMore", "optional", "commentPlaceholder", "sendComment", "sending"] as const satisfies readonly PublicKey[];

const SENTIMENT_TEXT = { positive: "text-pos-text", neutral: "text-neu-text", negative: "text-neg-text" } as const;

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const k = (await searchParams).k;
  // Without a valid, unexpired token for THIS response, the page doesn't exist.
  if (!isUuid(id) || typeof k !== "string" || !verifyResponseToken(env().RESPONSE_TOKEN_SECRET, id, k)) notFound();

  // Service role, scoped to this one response id (proven by the signed token above).
  const { data } = await adminClient()
    .from("responses")
    .select("id, rating, pending_rating, comment, drivers, share_consent, display_name, surveys(question, icon_set, brand_color, thank_you_message, allow_comment, website_url, status, drivers_positive, drivers_negative, review_cta_label, review_cta_url, icon_images, option_labels, language, reasons_question_positive, reasons_question_negative, accounts(name, logo_path))")
    .eq("id", id)
    .maybeSingle();
  const survey = (data?.surveys ?? null) as unknown as {
    question: string;
    icon_set: string;
    brand_color: string;
    thank_you_message: string;
    allow_comment: boolean;
    website_url: string | null;
    status: string;
    drivers_positive: string[];
    drivers_negative: string[];
    review_cta_label: string | null;
    review_cta_url: string | null;
    icon_images: Record<string, string> | null;
    option_labels: Record<string, string> | null;
    language: string;
    reasons_question_positive: string | null;
    reasons_question_negative: string | null;
    accounts: { name: string; logo_path: string | null } | null;
  } | null;
  if (!data || !survey || !isIconSetId(survey.icon_set)) notFound();

  const lang: Lang = isLang(survey.language) ? survey.language : "en";
  const rating = (data.pending_rating ?? data.rating) as number | null;
  const option =
    rating !== null
      ? resolveOptions(survey.icon_set, { images: iconUrlMap(survey.icon_set, survey.icon_images), labels: labelsFor(survey.icon_set, survey.option_labels) }, lang).find((o) => o.value === rating)
      : undefined;
  const sentiment = rating !== null ? sentimentOf(survey.icon_set, rating) : null;
  const business = survey.accounts?.name;
  const logo = logoUrl(survey.accounts?.logo_path);
  const active = survey.status === "active";
  const driverOptions = active && sentiment ? (sentiment === "positive" ? survey.drivers_positive : survey.drivers_negative) : [];
  // Review button only for happy customers, and only https links (also enforced by the database).
  const review =
    sentiment === "positive" && survey.review_cta_label && survey.review_cta_url?.startsWith("https://")
      ? { label: survey.review_cta_label, url: survey.review_cta_url }
      : null;
  const symbol = survey.icon_set === "stars5" && rating !== null ? "★".repeat(rating) : (survey.icon_set === "nps" || survey.icon_set === "ces") && rating !== null ? String(rating) : option?.symbol;

  return (
    <div lang={HTML_LANG[lang]} className="min-h-screen" style={{ background: `linear-gradient(180deg, ${survey.brand_color}14 0, transparent 260px)` }}>
      <div className="h-1.5" style={{ background: survey.brand_color }} />
      <main className="mx-auto flex max-w-md flex-col px-5 pb-10 pt-10 sm:pt-16">
        {logo ? (
          <img src={logo} alt={business ?? "Business logo"} className="mx-auto max-h-14 max-w-[200px] object-contain" />
        ) : (
          business && <p className="text-center text-sm font-semibold text-muted">{business}</p>
        )}
        <div className="mt-4 rounded-[var(--radius-hero)] border border-line bg-surface px-6 py-8 text-center shadow-[0_1px_2px_rgba(21,26,45,0.04)] sm:px-8">
          <p className="text-sm text-muted">{survey.question}</p>
          {option && (
            <div className="mt-4">
              {option.imageUrl ? (
                <img src={option.imageUrl} alt="" width={72} height={72} className="mx-auto h-[72px] w-[72px] object-contain" />
              ) : (
              <span
                className={`font-display block leading-none ${survey.icon_set === "nps" || survey.icon_set === "ces" ? "text-[56px] font-bold" : survey.icon_set === "stars5" ? "text-[36px] text-neu-fill" : "text-[64px]"}`}
                aria-hidden
              >
                {symbol}
              </span>
              )}
              <span className={`mt-2 block text-[15px] font-semibold ${sentiment ? SENTIMENT_TEXT[sentiment] : ""}`}>
                <span className="sr-only">{pt(lang, "youRated")} </span>
                {option.label}
              </span>
            </div>
          )}
          <h1 className="mt-5 text-[22px] font-bold leading-snug">{survey.thank_you_message}</h1>
          <ThanksClient
            responseId={data.id as string}
            token={k}
            allowComment={survey.allow_comment && active}
            existingComment={(data.comment as string | null) ?? ""}
            brandColor={survey.brand_color}
            driverOptions={driverOptions}
            driverPrompt={sentiment === "positive" ? (survey.reasons_question_positive ?? pt(lang, "wentWell")) : (survey.reasons_question_negative ?? pt(lang, "doBetter"))}
            share={sentiment === "positive" && survey.allow_comment && active ? { label: pt(lang, "shareConsent", { business: business || "This business" }), consent: Boolean(data.share_consent), name: (data.display_name as string | null) ?? "" } : null}
            text={Object.fromEntries(THANKS_KEYS.map((k) => [k, pt(lang, k)])) as Record<(typeof THANKS_KEYS)[number], string>}
            existingDrivers={(data.drivers as string[] | null) ?? []}
            review={review}
          />
        </div>
        {survey.website_url && (
          <a href={survey.website_url} rel="noopener noreferrer nofollow" className="link mx-auto mt-6 inline-flex min-h-11 items-center text-sm">
            {pt(lang, "goTo", { host: new URL(survey.website_url).hostname })}
          </a>
        )}
        <p className="mt-10 text-center text-[12px] text-muted">
          {pt(lang, "feedbackBy")} <span className="font-semibold">TapTruly</span> ·{" "}
          <a href="/privacy" className="underline underline-offset-2">
            {pt(lang, "privacy")}
          </a>
        </p>
      </main>
    </div>
  );
}
