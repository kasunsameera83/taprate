import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { verifyWallToken } from "@/lib/security/signing";
import { isIconSetId, ratingOption } from "@/lib/surveys/iconSets";
import { HTML_LANG, isLang, pt, standardLabel, type Lang } from "@/lib/i18n/public";
import { labelsFor } from "@/lib/surveys/customIcons";

export const metadata: Metadata = { title: "What our customers say", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Row = { id: string; rating: number | null; comment: string | null; display_name: string | null; created_at: string; surveys: { icon_set: string; option_labels: unknown } | null };

// Testimonial wall a business embeds on its website (iframe). Shows ONLY comments the customer agreed to
// share AND the business chose to show; first name at most, never an email. Everything is rendered as text.
export default async function WallPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const accountId = verifyWallToken(env().linkSecrets, token);
  if (!accountId) notFound();
  const lang: Lang = isLang(sp.lang) ? sp.lang : "en";
  const db = adminClient();
  const [{ data: acct }, { data: rows }] = await Promise.all([
    db.from("accounts").select("name, suspended_at").eq("id", accountId).maybeSingle(),
    db
      .from("responses")
      .select("id, rating, comment, display_name, created_at, surveys(icon_set, option_labels)")
      .eq("account_id", accountId)
      .eq("share_consent", true)
      .eq("sentiment", "positive")
      .not("featured_at", "is", null)
      .not("comment", "is", null)
      .order("featured_at", { ascending: false })
      .limit(12),
  ]);
  if (!acct || acct.suspended_at) notFound();
  const items = (rows ?? []) as unknown as Row[];

  return (
    <main lang={HTML_LANG[lang]} className="min-h-screen bg-transparent p-3">
      <h1 className="sr-only">{pt(lang, "wallTitle")}</h1>
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{pt(lang, "wallEmpty")}</p>
      ) : (
        <ul className="columns-1 gap-3 sm:columns-2 lg:columns-3">
          {items.map((r) => {
            const set = r.surveys && isIconSetId(r.surveys.icon_set) ? r.surveys.icon_set : null;
            const custom = set ? labelsFor(set, r.surveys?.option_labels) : {};
            const label = set && r.rating !== null ? (custom[String(r.rating)] ?? standardLabel(set, r.rating, lang)) : null;
            const stars = set === "stars5" && r.rating !== null ? "★".repeat(r.rating) : set && r.rating !== null ? ratingOption(set, r.rating)?.symbol : null;
            return (
              <li key={r.id} className="mb-3 break-inside-avoid rounded-[14px] border border-line bg-surface p-4">
                <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">&ldquo;{r.comment}&rdquo;</p>
                <p className="mt-3 flex items-center justify-between gap-2 text-[13px] text-muted">
                  <span className="font-semibold text-ink">{r.display_name || pt(lang, "aCustomer")}</span>
                  <span>
                    {stars && <span aria-hidden className={set === "stars5" ? "text-neu-fill" : ""}>{stars} </span>}
                    {label}
                  </span>
                </p>
                <p className="mt-1 text-[12px] text-muted">{new Date(r.created_at).toLocaleDateString(HTML_LANG[lang], { month: "long", year: "numeric" })}</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-center text-[11px] text-muted">
        {acct.name} ·{" "}
        <a href={env().appOrigin} target="_blank" rel="noopener noreferrer" className="font-semibold">
          {pt(lang, "collectedWith")}
        </a>
      </p>
    </main>
  );
}
