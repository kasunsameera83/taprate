import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { landingOrDefault, THEMES, type Landing, type PublicPromotion, type ThemeId } from "@/lib/site/content";

/** The PUBLISHED landing content (drafts are never shown to visitors). */
export async function loadLanding(): Promise<Landing> {
  const { data } = await adminClient().from("site_content").select("published").eq("key", "landing").maybeSingle();
  return landingOrDefault(data?.published);
}

/** Pop-ups and greetings that are switched on and running right now. */
export async function loadLivePromotions(): Promise<PublicPromotion[]> {
  const now = new Date().toISOString();
  const { data } = await adminClient()
    .from("site_promotions")
    .select("id, kind, title, body, cta_label, cta_url, theme")
    .eq("enabled", true)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("starts_at", { ascending: false })
    .limit(4);
  return (data ?? []).map((p) => ({
    id: p.id as string,
    kind: p.kind as "popup" | "greeting",
    title: p.title as string,
    body: (p.body as string | null) ?? null,
    ctaLabel: (p.cta_label as string | null) ?? null,
    ctaUrl: (p.cta_url as string | null) ?? null,
    theme: (p.theme as string) in THEMES ? (p.theme as ThemeId) : "generic",
  }));
}
