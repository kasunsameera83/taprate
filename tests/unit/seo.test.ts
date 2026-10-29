import { test } from "node:test";
import assert from "node:assert/strict";
import { blogPosting, breadcrumbs, faqPage, organization, softwareApp } from "../../src/lib/site/structuredData.ts";
import { DEFAULT_CATALOG } from "../../src/lib/billing/catalog.ts";
import { DEFAULT_LANDING } from "../../src/lib/site/content.ts";

const site = "https://taptruly.com";

test("structured data: organization, product price and FAQ", () => {
  assert.equal(organization(site).url, site);
  const app = softwareApp(site, "x", DEFAULT_CATALOG, "USD");
  const low = Math.min(...DEFAULT_CATALOG.plans.filter((p) => p.active).map((p) => p.price.USD.month)) / 100;
  assert.equal(app.offers[0]!.price, "0");
  assert.equal(app.offers[1]!.price, low.toFixed(2));
  assert.equal(softwareApp(site, "x", DEFAULT_CATALOG, "LKR").offers[1]!.priceCurrency, "LKR");
  const faq = faqPage(DEFAULT_LANDING.faq);
  assert.equal(faq.mainEntity.length, DEFAULT_LANDING.faq.length);
  assert.equal(faq.mainEntity[0]!.acceptedAnswer.text, DEFAULT_LANDING.faq[0]!.a);
});

test("structured data: blog post and breadcrumbs use absolute URLs", () => {
  const b = blogPosting(site, { slug: "a-b", title: "T", description: "D", authorName: "TapTruly team", publishedAt: "2026-10-30T00:00:00Z", updatedAt: "2026-10-30T00:00:00Z", image: null });
  assert.equal(b.url, "https://taptruly.com/blog/a-b");
  assert.equal(b.image, "https://taptruly.com/opengraph-image.png");
  assert.equal(breadcrumbs(site, [{ name: "Blog", path: "/blog" }]).itemListElement[0]!.item, "https://taptruly.com/blog");
});

test("JSON-LD escaping: a hostile string can't close the script tag", () => {
  // Same escaping as src/components/JsonLd.tsx
  const esc = (d: unknown) => JSON.stringify(d).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const out = esc(faqPage([{ q: "</script><script>alert(1)</script>", a: "a & b" }]));
  assert.ok(!out.includes("</script>") && !out.includes("<") && !out.includes(">"));
  assert.equal(JSON.parse(out).mainEntity[0].name, "</script><script>alert(1)</script>");
});

test("home page search text fits Google's limits", () => {
  assert.ok(DEFAULT_LANDING.seo.title.length <= 60, "title");
  assert.ok(DEFAULT_LANDING.seo.description.length <= 160, "description");
});
