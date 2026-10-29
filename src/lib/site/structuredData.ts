// schema.org data for the public pages. Pure, unit-tested.
import type { Catalog, Currency } from "../billing/catalog.ts";

type FaqItem = { q: string; a: string };

export function organization(site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TapTruly",
    url: site,
    logo: `${site}/icon-512.png`,
  };
}

export function website(site: string) {
  return { "@context": "https://schema.org", "@type": "WebSite", name: "TapTruly", url: site };
}

/** The product, with its real starting price (lowest active paid plan, monthly) in the visitor's currency. */
export function softwareApp(site: string, description: string, catalog: Catalog, currency: Currency) {
  const prices = catalog.plans.filter((p) => p.active).map((p) => p.price[currency].month).filter((n) => n > 0);
  const low = prices.length ? Math.min(...prices) / 100 : null;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TapTruly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: site,
    description,
    offers: [
      { "@type": "Offer", name: "Free start", price: "0", priceCurrency: currency, description: "50 free responses, no card needed" },
      ...(low !== null ? [{ "@type": "Offer", name: "Paid plans", price: low.toFixed(2), priceCurrency: currency, url: `${site}/#pricing` }] : []),
    ],
  };
}

export function faqPage(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.slice(0, 20).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function blogPosting(site: string, p: { slug: string; title: string; description: string; authorName: string; publishedAt: string; updatedAt: string; image: string | null }) {
  const url = `${site}/blog/${p.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title.slice(0, 110),
    description: p.description,
    url,
    mainEntityOfPage: url,
    datePublished: p.publishedAt,
    dateModified: p.updatedAt,
    author: { "@type": "Organization", name: p.authorName },
    publisher: { "@type": "Organization", name: "TapTruly", logo: { "@type": "ImageObject", url: `${site}/icon-512.png` } },
    image: p.image ?? `${site}/opengraph-image.png`,
  };
}

export function breadcrumbs(site: string, items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${site}${it.path}` })),
  };
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
