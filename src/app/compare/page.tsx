import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterAuto } from "@/components/site/SiteFooterAuto";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { formatMoney } from "@/lib/billing/catalog";

export const metadata: Metadata = {
  title: "TapTruly vs Customer Thermometer, Nicereply and Simplesat",
  description:
    "Compare one-click customer feedback tools side by side: starting price, responses included, cost per response, team members, channels and local language support.",
  alternates: { canonical: "/compare" },
};

// A factual comparison. Competitor details come only from their own public pricing and product pages
// (checked October 2026) and are labelled as such. No competitor logos, and nothing that suggests a link
// with them. Update the dates and figures whenever they change; "Not listed" means their site doesn't say.
const CHECKED = "October 2026";

type Cell = string | boolean | null; // true = yes, false = no, null = not listed on their site
type Tool = { name: string; price: number; responses: number; users: string; trial: string };

const OTHERS: Tool[] = [
  { name: "Customer Thermometer", price: 49, responses: 200, users: "Unlimited", trial: "Free account" },
  { name: "Nicereply", price: 79, responses: 100, users: "3 on Starter", trial: "14-day trial" },
  { name: "Simplesat", price: 119, responses: 300, users: "5 on Starter", trial: "Free trial" },
];

// Features: [TapTruly, Customer Thermometer, Nicereply, Simplesat]
const FEATURES: Array<{ label: string; cells: [Cell, Cell, Cell, Cell] }> = [
  { label: "One-tap ratings inside emails", cells: [true, true, true, true] },
  { label: "Helpdesk connections (Zendesk, Freshdesk and more)", cells: [true, true, true, true] },
  { label: "Alerts for unhappy customers", cells: [true, true, null, null] },
  { label: "Tablet / kiosk surveys", cells: [true, true, null, null] },
  { label: "QR codes and WhatsApp links", cells: [true, null, null, null] },
  { label: "Office TV screen", cells: [true, null, null, null] },
  { label: "AI comment summaries", cells: [true, null, null, null] },
  { label: "Social media share cards for reviews", cells: [true, null, null, null] },
  { label: "Reply to customers from the app", cells: [true, null, null, null] },
  { label: "Compare with your industry", cells: [true, null, null, null] },
  { label: "Survey pages on your own web address", cells: [true, null, null, null] },
  { label: "Live notifications in the app", cells: [true, null, null, null] },
  { label: "Surveys in Sinhala and Tamil", cells: [true, null, null, null] },
  { label: "Pay in Sri Lankan rupees", cells: [true, false, false, false] },
];

function Mark({ v }: { v: Cell }) {
  if (v === true) return <span className="font-bold text-pos-text" aria-label="Yes">✓</span>;
  if (v === false) return <span className="text-muted" aria-label="No">✕</span>;
  if (v === null) return <span className="text-[13px] text-muted">Not listed</span>;
  return <span>{v}</span>;
}

const per = (price: number, responses: number) => `${((price / responses) * 100).toFixed(1)}¢`;

export default async function ComparePage() {
  const catalog = await loadCatalog();
  const starter = catalog.plans.find((p) => p.id === "starter" && p.active) ?? catalog.plans.find((p) => p.active) ?? catalog.plans[0]!;
  const ours: Tool = {
    name: "TapTruly",
    price: starter.price.USD.month / 100,
    responses: starter.monthlyResponses,
    users: "Unlimited",
    trial: `Free plan (${catalog.free.responses} responses)`,
  };
  const tools = [ours, ...OTHERS];
  const cheaperThanAll = OTHERS.every((t) => t.price / t.responses > ours.price / ours.responses);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main">
        <section className="mx-auto max-w-5xl px-5 pb-10 pt-12 sm:pt-20">
          <p className="text-sm font-semibold text-muted">Comparison</p>
          <h1 className="mt-3 max-w-[22ch] text-[38px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[52px]">How TapTruly compares with other one-click feedback tools</h1>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-muted">
            The same idea, customers tap once to rate you, at a much lower price, with more ways to collect feedback and support for Sri Lankan businesses built in.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-5" aria-labelledby="price-title">
          <h2 id="price-title" className="text-[26px] font-bold">Price and what you get</h2>
          <p className="mt-1 text-sm text-muted">Each tool&rsquo;s cheapest monthly plan, in US dollars.</p>
          <div className="panel mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-[13px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Tool</span></th>
                  <th scope="col" className="px-4 py-3 font-semibold">Starting price</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Responses / month</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cost per response</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Team members</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Try it</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t, i) => (
                  <tr key={t.name} className={i === 0 ? "bg-brand-soft/60 font-semibold" : "border-t border-line"}>
                    <th scope="row" className="px-4 py-3 text-left">{t.name}</th>
                    <td className="px-4 py-3 tabular">{formatMoney(Math.round(t.price * 100), "USD")}</td>
                    <td className="px-4 py-3 tabular">{t.responses.toLocaleString("en")}</td>
                    <td className="px-4 py-3 tabular">{per(t.price, t.responses)}</td>
                    <td className="px-4 py-3">{t.users}</td>
                    <td className="px-4 py-3">{t.trial}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cheaperThanAll && (
            <p className="mt-3 text-sm text-muted">
              Per response, TapTruly&rsquo;s Starter plan costs a fraction of the others. In Sri Lanka you can also pay in rupees with PayHere.
            </p>
          )}
        </section>

        <section className="mx-auto mt-14 max-w-5xl px-5" aria-labelledby="feat-title">
          <h2 id="feat-title" className="text-[26px] font-bold">Features</h2>
          <div className="panel mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-[13px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Feature</span></th>
                  {tools.map((t, i) => (
                    <th key={t.name} scope="col" className={`px-4 py-3 text-center font-semibold ${i === 0 ? "text-brand" : ""}`}>{t.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f) => (
                  <tr key={f.label} className="border-t border-line">
                    <th scope="row" className="px-4 py-3 text-left font-medium">{f.label}</th>
                    {f.cells.map((c, i) => (
                      <td key={i} className={`px-4 py-3 text-center ${i === 0 ? "bg-brand-soft/40" : ""}`}><Mark v={c} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-5xl px-5" aria-labelledby="fair-title">
          <h2 id="fair-title" className="text-[26px] font-bold">When another tool might suit you better</h2>
          <ul className="mt-4 space-y-2 text-[16px] leading-relaxed text-muted">
            <li>
              <strong className="text-ink">You need employee surveys (eNPS).</strong> Nicereply lists employee survey types; TapTruly focuses on customers.
            </li>
            <li>
              <strong className="text-ink">You run IT services on ServiceNow, ConnectWise, Autotask or Kaseya.</strong> Customer Thermometer lists ready-made connections for these.
            </li>
            <li>
              <strong className="text-ink">You need very high volumes with advanced reporting.</strong> Their larger plans may fit. Talk to us first: we can usually match it.
            </li>
          </ul>
        </section>

        <section className="mx-auto mt-14 max-w-5xl px-5 pb-20">
          <div className="rounded-[var(--radius-hero)] bg-ink p-8 text-white sm:p-10">
            <h2 className="text-[26px] leading-tight sm:text-[30px]">Try TapTruly free with your own customers</h2>
            <p className="mt-3 text-[#cbd5e1]">{catalog.free.responses} free responses, no card needed. Switching? Import your past ratings from a CSV.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="btn min-h-12 bg-white px-6 text-brand hover:bg-[#eef2ff]">
                Start free
              </Link>
              <Link href="/#pricing" className="btn min-h-12 border border-white/30 px-6 text-white hover:bg-white/10">
                See all prices
              </Link>
            </div>
          </div>
          <p className="mt-6 text-[13px] leading-relaxed text-muted">
            Other tools&rsquo; prices and features are taken from their own public websites ({CHECKED}) and may have changed since; check their sites for the latest. &ldquo;Not listed&rdquo;
            means we couldn&rsquo;t find it on their website, not that it can&rsquo;t be done. Product names belong to their owners; TapTruly isn&rsquo;t connected with them.
          </p>
        </section>
      </main>
      <SiteFooterAuto />
    </div>
  );
}
