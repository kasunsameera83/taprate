import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { buildLinkToken, buildLocationTag, buildShareToken } from "@/lib/security/signing";
import { ICON_SETS, isIconSetId, type IconSetId } from "@/lib/surveys/iconSets";
import { logoUrl } from "@/lib/branding";
import type { Channel } from "@/lib/validation/schemas";
import { iconUrlMap, labelsFor, resolveOptions, type ResolvedOption } from "@/lib/surveys/customIcons";
import { isLang, type Lang } from "@/lib/i18n/public";

export type PublicSurvey = {
  id: string;
  question: string;
  iconSet: IconSetId;
  brandColor: string;
  active: boolean;
  business: string;
  logo: string | null;
  /** Rating buttons with the business's own pictures and labels applied. */
  options: ResolvedOption[];
  /** Language of what customers see. */
  lang: Lang;
};

/** Survey details for public pages. Service role, scoped to one survey id the caller already verified. */
export async function loadPublicSurvey(surveyId: string): Promise<PublicSurvey | null> {
  const { data } = await adminClient()
    .from("surveys")
    .select("id, question, icon_set, brand_color, status, icon_images, option_labels, language, accounts(name, logo_path)")
    .eq("id", surveyId)
    .maybeSingle();
  const acct = (data?.accounts ?? null) as unknown as { name: string; logo_path: string | null } | null;
  if (!data || !isIconSetId(data.icon_set) || data.status === "archived") return null;
  const lang: Lang = isLang(data.language) ? data.language : "en";
  return {
    lang,
    id: data.id,
    question: data.question,
    iconSet: data.icon_set,
    brandColor: data.brand_color,
    active: data.status === "active",
    business: acct?.name ?? "",
    logo: logoUrl(acct?.logo_path),
    options: resolveOptions(data.icon_set, { images: iconUrlMap(data.icon_set, data.icon_images), labels: labelsFor(data.icon_set, data.option_labels) }, lang),
  };
}

/**
 * Signed one-tap links for every rating option, tagged with the channel they were shared through and,
 * for a branch's QR code or link, the branch (an already verified location id).
 */
export function ratingLinks(surveyId: string, options: ResolvedOption[], channel: Exclude<Channel, "kiosk" | "email">, locationId?: string | null) {
  const e = env();
  const loc = locationId ? `&l=${buildLocationTag(e.LINK_SIGNING_SECRET, surveyId, locationId)}` : "";
  return options.map((o) => ({
    ...o,
    href: `${e.appOrigin}/r/${buildLinkToken(e.LINK_SIGNING_SECRET, surveyId, o.value)}?c=${channel}${loc}`,
  }));
}

export function shareUrl(surveyId: string, channel?: Exclude<Channel, "kiosk" | "email">, locationId?: string | null): string {
  const e = env();
  const sp = new URLSearchParams();
  if (channel) sp.set("c", channel);
  if (locationId) sp.set("l", buildLocationTag(e.LINK_SIGNING_SECRET, surveyId, locationId));
  const q = sp.toString();
  return `${e.appOrigin}/s/${buildShareToken(e.LINK_SIGNING_SECRET, surveyId)}${q ? `?${q}` : ""}`;
}

export function widgetUrl(surveyId: string): string {
  const e = env();
  return `${e.appOrigin}/w/${buildShareToken(e.LINK_SIGNING_SECRET, surveyId)}`;
}
