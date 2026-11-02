import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterAuto } from "@/components/site/SiteFooterAuto";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { formatMoney } from "@/lib/billing/catalog";

export const metadata: Metadata = {
  title: "Why TapTruly: one-tap customer feedback at a fair price",
  description:
    "What you get with TapTruly: one-tap ratings in emails, QR codes, WhatsApp and kiosks, follow-ups, AI summaries and live dashboards, from a low monthly price. Start free.",
  alternates: { canonical: "/compare" },
};

// What TapTruly offers, in our own words and with our own numbers only (no other companies named).
const POINTS: Array<{ title: string; body: string }> = [
  { title: "One tap, more answers", body: "Customers tap a face in your email, QR code, WhatsApp message or kiosk. No forms or sign-up, so far more people answer." },
  { title: "Every channel included", body: "Emails, your helpdesk, QR codes, WhatsApp and SMS links, a website widget, tablet kiosks and an office TV screen, on one dashboard." },
  { title: "Turn unhappy into happy", body: "Instant alerts, follow-ups with owners and due dates, replies sent from TapTruly, and a “did we fix it?” check that shows who you won back." },
  { title: "Know what customers say", body: "AI reads every comment and gives you the themes, real quotes and next steps. Compare your score with similar businesses." },
  { title: "Made for Sri Lanka, ready for the world", body: "Surveys in English, Sinhala and Tamil. Pay in rupees with PayHere or in US dollars by card." },
  { title: "Secure by design", body: "Two-step sign-in, every request checked on the server, customer data kept private, and your data exportable any time." },
];

const INCLUDED: string[] = [
  "One-tap ratings inside emails",
  "Helpdesk connections (Zendesk, Freshdesk, Gorgias, Intercom, Front and more)",
  "QR codes, WhatsApp and SMS links",
  "Tablet kiosks and a website widget",
  "Alerts and follow-ups for unhappy customers",
  "Reply to customers from TapTruly",
  "Office TV screen",
  "AI comment summaries",
  "Compare with your industry",
  "Social media share cards and monthly highlights",
  "Surveys in English, Sinhala and Tamil",
  "Unlimited team members on paid plans",
];

export default async function WhyTapTruly() {
  const catalog = await loadCatalog();
  const plans = catalog.plans.filter((p) => p.active);
  const starter = plans.find((p) => p.id === "starter") ?? plans[0];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main">
        <section className="mx-auto max-w-5xl px-5 pb-10 pt-12 sm:pt-20">
          <p className="text-sm font-semibold text-muted">Why TapTruly</p>
          <h1 className="mt-3 max-w-[22ch] text-[38px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[52px]">Customer feedback that&rsquo;s simple for them and useful for you</h1>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-muted">
            Everything you need to hear from every customer and act on it{starter ? <>, from {formatMoney(starter.price.USD.month, "USD")} a month</> : null}. Start free with{" "}
            {catalog.free.responses} responses, no card needed.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-5" aria-label="Why businesses choose TapTruly">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {POINTS.map((p) => (
              <article key={p.title} className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
                <h2 className="text-[18px] font-bold">{p.title}</h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-5xl px-5" aria-labelledby="price-title">
          <h2 id="price-title" className="text-[26px] font-bold">Simple prices, more for your money</h2>
          <p className="mt-1 text-sm text-muted">Monthly prices in US dollars. Unused responses roll over.</p>
          <div className="panel mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-line text-left text-[13px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Price</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Responses / month</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cost per response</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <th scope="row" className="px-4 py-3 text-left">Free</th>
                  <td className="px-4 py-3">$0</td>
                  <td className="px-4 py-3 tabular">{catalog.free.responses.toLocaleString("en")} to start</td>
                  <td className="px-4 py-3">Free</td>
                </tr>
                {plans.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <th scope="row" className="px-4 py-3 text-left">{p.name}</th>
                    <td className="px-4 py-3 tabular">{formatMoney(p.price.USD.month, "USD")}</td>
                    <td className="px-4 py-3 tabular">{p.monthlyResponses.toLocaleString("en")}</td>
                    <td className="px-4 py-3 tabular">{(p.price.USD.month / p.monthlyResponses).toFixed(1)}¢</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">
            In Sri Lanka you can pay in rupees.{" "}
            <Link href="/#pricing" className="link">
              See all prices
            </Link>
          </p>
        </section>

        <section className="mx-auto mt-14 max-w-5xl px-5" aria-labelledby="inc-title">
          <h2 id="inc-title" className="text-[26px] font-bold">What&rsquo;s included</h2>
          <ul className="mt-5 grid gap-x-8 gap-y-2.5 text-[15px] sm:grid-cols-2">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <span className="mt-0.5 font-bold text-pos-text" aria-hidden>
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Some features need a paid plan. See the plans for details.</p>
        </section>

        <section className="mx-auto mt-14 max-w-5xl px-5 pb-20">
          <div className="rounded-[var(--radius-hero)] bg-ink p-8 text-white sm:p-10">
            <h2 className="text-[26px] leading-tight sm:text-[30px]">Try TapTruly free with your own customers</h2>
            <p className="mt-3 text-[#cbd5e1]">{catalog.free.responses} free responses, no card needed. Switching from another tool? Import your past ratings from a CSV.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="btn min-h-12 bg-white px-6 text-brand hover:bg-[#eef2ff]">
                Start free
              </Link>
              <Link href="/#pricing" className="btn min-h-12 border border-white/30 px-6 text-white hover:bg-white/10">
                See all prices
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooterAuto />
    </div>
  );
}
