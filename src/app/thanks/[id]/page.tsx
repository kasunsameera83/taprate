import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { isUuid, verifyResponseToken } from "@/lib/security/signing";
import { isIconSetId, ratingOption } from "@/lib/surveys/iconSets";
import { ThanksClient } from "./ThanksClient";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };

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

  const { data } = await adminClient()
    .from("responses")
    .select("id, rating, pending_rating, comment, surveys(question, icon_set, brand_color, thank_you_message, allow_comment, website_url, status)")
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
  } | null;
  if (!data || !survey || !isIconSetId(survey.icon_set)) notFound();

  const rating = (data.pending_rating ?? data.rating) as number | null;
  const option = rating !== null ? ratingOption(survey.icon_set, rating) : undefined;

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="panel p-8 text-center" style={{ borderTop: `4px solid ${survey.brand_color}` }}>
        <p className="text-sm text-[var(--muted)]">{survey.question}</p>
        {option && (
          <p className="mt-3 text-4xl" style={{ color: option.color }}>
            {option.symbol}
            <span className="mt-1 block text-base font-medium">{option.label}</span>
          </p>
        )}
        <h1 className="mt-4 text-xl font-semibold">{survey.thank_you_message}</h1>
        <ThanksClient
          responseId={data.id as string}
          token={k}
          allowComment={survey.allow_comment && survey.status === "active"}
          existingComment={(data.comment as string | null) ?? ""}
          brandColor={survey.brand_color}
        />
        {survey.website_url && (
          <a href={survey.website_url} rel="noopener noreferrer nofollow" className="mt-6 inline-block text-sm text-[var(--accent)]">
            Back to {new URL(survey.website_url).hostname}
          </a>
        )}
      </div>
    </main>
  );
}
