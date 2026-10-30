import type { Metadata } from "next";
import { loadLanding, loadLivePromotions } from "@/lib/site/server";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { LandingView } from "@/components/site/LandingView";
import { preferredCurrency } from "@/lib/site/geo";
import { JsonLd } from "@/components/JsonLd";
import { applyFree } from "@/lib/site/content";
import { faqPage, organization, siteUrl, softwareApp, website } from "@/lib/site/structuredData";

// The landing page is edited by the product owner in /admin/landing (only PUBLISHED content shows here).
export async function generateMetadata(): Promise<Metadata> {
  const [raw, catalog] = await Promise.all([loadLanding(), loadCatalog()]);
  const c = applyFree(raw, catalog.free.responses);
  return {
    title: { absolute: c.seo.title },
    description: c.seo.description,
    alternates: { canonical: "/" },
    openGraph: { title: c.seo.title, description: c.seo.description, url: "/" },
    twitter: { card: "summary_large_image", title: c.seo.title, description: c.seo.description },
  };
}

export default async function Home() {
  const [raw, catalog, promotions, currency] = await Promise.all([loadLanding(), loadCatalog(), loadLivePromotions(), preferredCurrency()]);
  const c = applyFree(raw, catalog.free.responses); // "{free}" in the text → the free plan's number
  const site = siteUrl();
  return (
    <>
      <JsonLd data={[organization(site), website(site), softwareApp(site, c.seo.description, catalog, currency), ...(c.faq.length ? [faqPage(c.faq)] : [])]} />
      <LandingView c={c} catalog={catalog} promotions={promotions} currency={currency} />
    </>
  );
}
