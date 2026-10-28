import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Switching from Delighted | TapTruly",
  description: "Delighted closed on 30 June 2026. Move your NPS and CSAT surveys to TapTruly in an afternoon: import your history, keep one-click email ratings, and follow up on every unhappy customer.",
  alternates: { canonical: "/switch-from-delighted" },
};

// A plain, factual page for teams looking for a new home after Delighted closed.
// (We don't use Delighted's name in a way that suggests a connection, and show no logos.)
const CARRY = [
  { from: "NPS, CSAT and effort surveys", to: "0–10, stars, faces, thumbs and 1–7 effort scales, with the same one-tap buttons in emails." },
  { from: "Emailing customers", to: "Send by email from TapTruly with one reminder, or paste the buttons into Gmail, Outlook, Zendesk, Freshdesk or HubSpot." },
  { from: "Web, link and SMS surveys", to: "Share links, QR codes, WhatsApp messages, a website widget and tablet kiosks." },
  { from: "Following up on detractors", to: "Every unhappy rating opens a follow-up with an owner and a due date, plus alerts in email, Slack or Teams." },
  { from: "Comment themes", to: "AI reads every comment and gives you the themes, real quotes and next steps." },
  { from: "Your history", to: "Import your old responses from a CSV. Delighted's column names are recognised for you." },
];

const STEPS = [
  { title: "Bring your history", body: "Download your responses as CSV, create a matching survey (0–10 for NPS), and import. Repeated rows are skipped, so it's safe to run twice." },
  { title: "Switch your emails", body: "Upload your customer list and send the survey from TapTruly, or trigger one email per customer from Zapier, Make, Shopify or your helpdesk with our API." },
  { title: "Close the loop", body: "Turn on follow-ups and alerts, invite your team, and get a weekly report with what customers are saying." },
];

export default function SwitchFromDelighted() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main">
        <section className="mx-auto max-w-4xl px-5 pb-16 pt-12 sm:pt-20">
          <p className="text-sm font-semibold text-muted">For teams moving after Delighted closed on 30 June 2026</p>
          <h1 className="mt-3 max-w-[18ch] text-[40px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[56px]">A simple new home for your customer feedback</h1>
          <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-muted">
            TapTruly keeps what made one-click surveys work: customers tap once, right in the email, and you see it straight away. Move your surveys and your history in an afternoon.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary min-h-12 px-6 text-base">
              Start free
            </Link>
            <Link href="/#pricing" className="btn btn-secondary min-h-12 px-6 text-base">
              See pricing
            </Link>
          </div>
        </section>

        <section aria-labelledby="carry" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-4xl px-5 py-16">
            <h2 id="carry" className="text-[28px] font-bold leading-tight sm:text-[34px]">
              What you used, and where it lives now
            </h2>
            <dl className="mt-8 divide-y divide-line border-y border-line">
              {CARRY.map((c) => (
                <div key={c.from} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-6">
                  <dt className="font-semibold">{c.from}</dt>
                  <dd className="text-muted">{c.to}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="move" className="mx-auto max-w-4xl px-5 py-16">
          <h2 id="move" className="text-[28px] font-bold leading-tight sm:text-[34px]">
            Move in three steps
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-ink pt-4">
                <span className="font-display text-[36px] font-bold leading-none text-brand">{i + 1}</span>
                <h3 className="mt-2 font-sans text-lg font-semibold tracking-normal">{s.title}</h3>
                <p className="mt-1 text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-sm text-muted">
            Your data stays yours: export everything as CSV or JSON at any time, and delete your account and data yourself in Settings.
          </p>
        </section>

        <section className="bg-brand text-white">
          <div className="mx-auto flex max-w-4xl flex-col items-start gap-6 px-5 py-16 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-[18ch] text-[30px] font-bold leading-[1.1] sm:text-[40px]">Get your first rating today</h2>
            <Link href="/signup" className="btn min-h-12 bg-white px-6 text-base text-brand hover:bg-[#eef2ff]">
              Create a free account
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
