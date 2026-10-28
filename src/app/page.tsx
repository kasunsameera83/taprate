import type { Metadata } from "next";
import { loadLanding, loadLivePromotions } from "@/lib/site/server";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { LandingView } from "@/components/site/LandingView";

// The landing page is edited by the product owner in /admin/landing (only PUBLISHED content shows here).
export async function generateMetadata(): Promise<Metadata> {
  const c = await loadLanding();
  return { title: { absolute: c.seo.title }, description: c.seo.description };
}

export default async function Home() {
  const [c, catalog, promotions] = await Promise.all([loadLanding(), loadCatalog(), loadLivePromotions()]);
  return <LandingView c={c} catalog={catalog} promotions={promotions} />;
}
