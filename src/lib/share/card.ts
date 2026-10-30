import "server-only";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { buildCardToken } from "@/lib/security/signing";
import { planAllows, showBranding } from "@/lib/billing/features";
import { logoUrl } from "@/lib/branding";
import { isIconSetId } from "@/lib/surveys/iconSets";
import { labelsFor } from "@/lib/surveys/customIcons";
import { isLang, standardLabel } from "@/lib/i18n/public";

export type ShareCard = {
  responseId: string;
  accountId: string;
  comment: string;
  name: string;
  businessName: string;
  logo: string | null;
  color: string;
  /** 1-5 stars when the survey uses stars, otherwise null (the label is shown instead). */
  stars: number | null;
  label: string | null;
  /** "Collected with TapTruly" (hidden on Growth/Scale when the business chooses). */
  branding: boolean;
};

const MAX_COMMENT = 280;
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Everything a share card shows, or null when this comment may NOT be shared: the customer must have
 * agreed to social media sharing, the rating must be happy, there must be a comment, the business must not be suspended and must be
 * on a plan with share cards. Checked every time, so withdrawing consent or deleting the comment stops it.
 * Never includes the customer's email, ticket or agent.
 */
export async function loadShareCard(responseId: string): Promise<ShareCard | null> {
  const db = adminClient();
  const { data: r } = await db
    .from("responses")
    .select("id, account_id, rating, comment, display_name, share_consent, share_social, sentiment, status, surveys(icon_set, option_labels, brand_color, language)")
    .eq("id", responseId)
    .maybeSingle();
  if (!r || !r.share_consent || !r.share_social || r.sentiment !== "positive" || r.status !== "confirmed" || r.rating === null) return null;
  const comment = typeof r.comment === "string" ? r.comment.trim() : "";
  if (!comment) return null;
  const { data: acct } = await db.from("accounts").select("name, logo_path, suspended_at, plan, hide_branding").eq("id", r.account_id).maybeSingle();
  if (!acct || acct.suspended_at || !planAllows(acct.plan as string, "social")) return null;

  const s = (r.surveys ?? null) as unknown as { icon_set: string; option_labels: unknown; brand_color: string; language: string } | null;
  const set = s && isIconSetId(s.icon_set) ? s.icon_set : null;
  const lang = isLang(s?.language) ? s!.language : "en";
  const rating = r.rating as number;
  const label = set ? (labelsFor(set, s?.option_labels)[String(rating)] ?? standardLabel(set, rating, lang)) : null;
  const stars = set === "stars5" ? Math.max(1, Math.min(5, rating)) : null;
  const short = comment.length > MAX_COMMENT ? `${comment.slice(0, MAX_COMMENT - 1).trimEnd()}…` : comment;
  return {
    responseId: r.id as string,
    accountId: r.account_id as string,
    comment: short,
    name: (typeof r.display_name === "string" && r.display_name.trim()) || "A happy customer",
    businessName: acct.name as string,
    logo: logoUrl(acct.logo_path as string | null),
    color: s && HEX.test(s.brand_color) ? s.brand_color : "#4f46e5",
    stars,
    label,
    branding: showBranding(acct.plan as string, acct.hide_branding as boolean),
  };
}

export function shareCardUrls(responseId: string) {
  const e = env();
  const token = buildCardToken(e.LINK_SIGNING_SECRET, responseId);
  const page = `${e.appOrigin}/c/${token}`;
  return { token, page, image: `${page}/image`, square: `${page}/image?size=square` };
}
