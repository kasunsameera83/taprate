import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { buildLinkToken, buildShareToken } from "@/lib/security/signing";
import { ICON_SETS, isIconSetId, type IconSetId } from "@/lib/surveys/iconSets";
import { logoUrl } from "@/lib/branding";
import type { Channel } from "@/lib/validation/schemas";
import { iconUrlMap, labelsFor, resolveOptions, type ResolvedOption } from "@/lib/surveys/customIcons";

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
};

/** Survey details for public pages. Service role, scoped to one survey id the caller already verified. */
export async function loadPublicSurvey(surveyId: string): Promise<PublicSurvey | null> {
  const { data } = await adminClient()
    .from("surveys")
    .select("id, question, icon_set, brand_color, status, icon_images, option_labels, accounts(name, logo_path)")
    .eq("id", surveyId)
    .maybeSingle();
  const acct = (data?.accounts ?? null) as unknown as { name: string; logo_path: string | null } | null;
  if (!data || !isIconSetId(data.icon_set) || data.status === "archived") return null;
  return {
    id: data.id,
    question: data.question,
    iconSet: data.icon_set,
    brandColor: data.brand_color,
    active: data.status === "active",
    business: acct?.name ?? "",
    logo: logoUrl(acct?.logo_path),
    options: resolveOptions(data.icon_set, { images: iconUrlMap(data.icon_set, data.icon_images), labels: labelsFor(data.icon_set, data.option_labels) }),
  };
}

/** Signed one-tap links for every rating option, tagged with the channel they were shared through. */
export function ratingLinks(surveyId: string, options: ResolvedOption[], channel: Exclude<Channel, "kiosk" | "email">) {
  const e = env();
  return options.map((o) => ({
    ...o,
    href: `${e.appOrigin}/r/${buildLinkToken(e.LINK_SIGNING_SECRET, surveyId, o.value)}?c=${channel}`,
  }));
}

export function shareUrl(surveyId: string, channel?: Exclude<Channel, "kiosk" | "email">): string {
  const e = env();
  return `${e.appOrigin}/s/${buildShareToken(e.LINK_SIGNING_SECRET, surveyId)}${channel ? `?c=${channel}` : ""}`;
}

export function widgetUrl(surveyId: string): string {
  const e = env();
  return `${e.appOrigin}/w/${buildShareToken(e.LINK_SIGNING_SECRET, surveyId)}`;
}
