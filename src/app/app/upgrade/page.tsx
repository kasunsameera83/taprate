import type { Metadata } from "next";
import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { formatMoney } from "@/lib/billing/catalog";
import { FEATURE_PLAN, planAllows, planLimits, type Feature } from "@/lib/billing/features";
import { planLabel } from "@/lib/billing/credits";
import { preferredCurrency } from "@/lib/site/geo";

export const metadata: Metadata = { title: "What paid plans include", robots: { index: false, follow: false } };

// What a paid plan unlocks, in plain words, with what this business already has ticked.
// Display only: every feature is still checked on the server and in the database.

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ITEMS: Array<{ feature: Feature | "volume" | "team"; title: string; body: string; icon: React.ReactNode }> = [
  { feature: "volume", title: "Fresh responses every month", body: "From 500 a month on Starter. Unused responses roll over, so nothing is wasted.", icon: <Svg><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Svg> },
  { feature: "team", title: "Your whole team and every branch", body: "Add as many team members and branches as you need. The free plan has 2 people and 1 branch.", icon: <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></Svg> },
  { feature: "ai", title: "AI insights and reply drafts", body: "AI reads every comment and tells you the themes, real quotes and what to fix next. It also drafts replies for you.", icon: <Svg><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4Z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" /></Svg> },
  { feature: "replies", title: "Reply to customers from TapTruly", body: "Answer an unhappy customer by email straight from the follow-up, and see the whole conversation in one place.", icon: <Svg><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="m10 9-3 3 3 3" /><path d="M7 12h6a3 3 0 0 1 3 3" /></Svg> },
  { feature: "tv", title: "Office TV screen", body: "Show live ratings and happy comments on a TV in your office or shop. It updates by itself.", icon: <Svg><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></Svg> },
  { feature: "reports", title: "Weekly and monthly email reports", body: "Your score, trends and comments that need attention, in your inbox without logging in.", icon: <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg> },
  { feature: "integrations", title: "Helpdesk and app connections", body: "Zendesk, Freshdesk, Gorgias, Intercom, Front, Shopify, Slack and webhooks, so ratings land where your team works.", icon: <Svg><path d="M9 7H6a3 3 0 0 0 0 6h3M15 7h3a3 3 0 0 1 0 6h-3M8 10h8" /><path d="M12 17v4" /></Svg> },
  { feature: "social", title: "Share happy comments on social media", body: "Turn a great comment into a ready-made picture for Facebook, Instagram or WhatsApp, with your logo.", icon: <Svg><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" /><path d="M17 9a4 4 0 0 1 0 6" /></Svg> },
  { feature: "repeats", title: "Repeat surveys", body: "Ask regular customers again every few weeks or months, automatically.", icon: <Svg><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></Svg> },
  { feature: "api", title: "The API", body: "Send surveys and read ratings from your own systems.", icon: <Svg><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" /></Svg> },
  { feature: "white_label", title: "Remove the TapTruly name", body: "Surveys and emails show only your brand. Growth and Scale plans.", icon: <Svg><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></Svg> },
  { feature: "custom_domain", title: "Your own web address and email domain", body: "Survey pages on feedback.yourbusiness.com and emails from your domain. Scale plan.", icon: <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" /></Svg> },
];

const TIER_NOTE = { starter: "From Starter", growth: "Growth and Scale", scale: "Scale" } as const;

export default async function UpgradePage() {
  const { supabase, active } = await requirePageSession({ needAccount: true });
  const [{ data: acct }, catalog, currency] = await Promise.all([
    supabase.from("accounts").select("plan").eq("id", active!.accountId).maybeSingle(),
    loadCatalog(),
    preferredCurrency(),
  ]);
  const plan = (acct?.plan as string | undefined) ?? "trial";
  const isOwner = active!.role === "owner";
  const cheapest = catalog.plans.filter((p) => p.active).sort((a, b) => a.price[currency].month - b.price[currency].month)[0];
  const has = (f: (typeof ITEMS)[number]["feature"]) => (f === "volume" || f === "team" ? planLimits(plan).members > 2 : planAllows(plan, f));

  return (
    <div className="space-y-8">
      <header className="rounded-[var(--radius-hero)] bg-ink p-6 text-white sm:p-8">
        <p className="text-sm font-semibold text-[#c7d2fe]">You&rsquo;re on the {planLabel(plan)} plan</p>
        <h1 className="mt-2 max-w-[24ch] text-[28px] font-bold leading-tight sm:text-[34px]">Get more from every customer&rsquo;s feedback</h1>
        <p className="mt-3 max-w-[60ch] text-[#cbd5e1]">
          Paid plans give you fresh responses every month and the tools to act on them
          {cheapest ? <>, from {formatMoney(cheapest.price[currency].month, currency)} a month</> : null}. Cancel any time.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {isOwner ? (
            <Link href="/app/settings/billing" className="btn min-h-11 bg-white px-5 text-brand hover:bg-[#eef2ff]">
              Choose a plan
            </Link>
          ) : (
            <p className="rounded-[10px] bg-white/10 px-4 py-2.5 text-sm">Only the business owner can choose a plan. Share this page with them.</p>
          )}
        </div>
      </header>

      <section aria-labelledby="inc">
        <h2 id="inc" className="text-[20px] font-bold">
          What&rsquo;s included
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {ITEMS.map((it) => {
            const got = has(it.feature);
            const tier = it.feature === "volume" || it.feature === "team" ? "starter" : FEATURE_PLAN[it.feature];
            return (
              <li key={it.title} className="flex gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${got ? "bg-pos-soft text-pos-text" : "bg-brand-soft text-brand"}`}>{it.icon}</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {it.title}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${got ? "bg-pos-soft text-pos-text" : "bg-canvas text-faint"}`}>{got ? "✓ You have this" : TIER_NOTE[tier]}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted">{it.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {isOwner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-brand/30 bg-brand-soft p-5">
          <p className="text-ink">
            <strong>Ready when you are.</strong> Pick a plan in a minute. Your surveys and ratings stay exactly as they are.
          </p>
          <Link href="/app/settings/billing" className="btn btn-primary">
            See plans and prices
          </Link>
        </div>
      )}
    </div>
  );
}
