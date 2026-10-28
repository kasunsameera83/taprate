import Link from "next/link";
import type { Catalog, Currency } from "@/lib/billing/catalog";
import type { Landing, PublicPromotion } from "@/lib/site/content";
import { IconShield } from "@/components/icons";
import { PricingTable } from "./PricingTable";
import { GreetingBar, PromoPopup } from "./Promotions";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { HeroShowcase } from "./HeroShowcase";
import { BrandMorph } from "./BrandMorph";
import { BranchesScreen, ChannelsScreen, DashboardScreen, FollowUpScreen, InsightsScreen, LanguagesScreen, LeaderboardScreen, SendScreen, WallScreen } from "./Screens";
import { KineticTitle, Reveal } from "./KineticTitle";
import { ScrollStatement } from "./ScrollStatement";
import { TapStory } from "./TapStory";
import { TiltCard } from "./TiltCard";
import { ShowcaseRow } from "./ShowcaseRow";

// The public landing page. Text marked "c." comes from /admin → Landing page; the product pictures and
// their captions below are part of the design. Everything is rendered as text (React escapes it).

const CHANNELS = ["Gmail & Outlook signatures", "Zendesk", "Freshdesk", "HubSpot", "WhatsApp", "QR codes", "Your website", "Tablet kiosk", "Zapier & Make"];

type Showcase = { title: string; body: string; points: string[]; Screen: () => React.ReactNode; localOnly?: boolean };

const SHOWCASE: Showcase[] = [
  {
    title: "See how customers feel, today",
    body: "Every confirmed tap lands on your dashboard straight away. Satisfaction, trends, and the reasons customers pick, for every survey and every agent.",
    points: ["Satisfaction, NPS and effort scores", "Compare with last week or month", "Filter by survey, agent or channel"],
    Screen: DashboardScreen,
  },
  {
    title: "Never miss an unhappy customer",
    body: "A bad rating opens a follow-up with an owner and a due date. Your team gets an alert in email, Slack or Teams, and the customer gets a call back.",
    points: ["Assign, add notes, mark resolved", "AI writes a first draft of your reply", "Added to the Zendesk or Freshdesk ticket"],
    Screen: FollowUpScreen,
  },
  {
    title: "We'll send the survey for you",
    body: "No helpdesk or email signature? Upload your customer list and TapRate emails them from your business name, with one gentle reminder for anyone who hasn't answered.",
    points: ["Up to 1,000 people per send, from a CSV or pasted list", "Never asks the same person twice in a month", "Unsubscribes and bounces handled for you"],
    Screen: SendScreen,
  },
  {
    title: "Collect ratings wherever you meet customers",
    body: "Not just email. Print a QR code for the counter or receipts, share a link on WhatsApp, add a widget to your website, or put a tablet at reception.",
    points: ["QR codes that print sharp at any size", "WhatsApp and SMS links", "Kiosk mode that resets for the next person"],
    Screen: ChannelsScreen,
  },
  {
    title: "Compare every branch",
    body: "Running more than one shop, clinic or counter? Give each branch its own QR code and kiosk, then see which one customers love and which needs help.",
    points: ["A QR code and kiosk for each branch", "Side-by-side satisfaction on the dashboard", "Filter ratings and exports by branch"],
    Screen: BranchesScreen,
  },
  {
    title: "Ask in Sinhala, Tamil or English",
    body: "Your customers see the rating buttons, thank-you page, kiosk and emails in their own language. Write your question in it too.",
    points: ["Choose the language for each survey", "Rating labels translated for you", "Mix languages across surveys"],
    Screen: LanguagesScreen,
    localOnly: true,
  },
  {
    title: "Make the buttons yours",
    body: "Use the ready-made faces, thumbs or stars, or upload your own pictures and change the words under each button. Your mascot, your product, your way of speaking.",
    points: ["Your own pictures for every rating", "Your own words, like \u201cPerfect brew\u201d", "Every upload checked and cleaned for safety"],
    Screen: BrandMorph,
  },
  {
    title: "Know what to fix, in plain words",
    body: "AI reads every comment and tells you the main themes, with real quotes and practical next steps. No spreadsheets, no guessing.",
    points: ["Themes with how many people mention them", "Quotes checked against real comments", "Weekly or monthly email reports"],
    Screen: InsightsScreen,
  },
  {
    title: "Celebrate the people customers love",
    body: "See which agents earn the happiest customers, and where coaching would help. Agents can see their own ratings too.",
    points: ["Fair ranking with a minimum number of ratings", "Agents see only their own feedback", "A Monday email with each agent's wins"],
    Screen: LeaderboardScreen,
  },
  {
    title: "Show off your happy customers",
    body: "Put real comments on your website with one line of code, and keep a live screen on the office wall so the whole team sees every win.",
    points: ["Only comments customers agreed to share", "You choose which ones appear", "Office TV screen that updates every minute"],
    Screen: WallScreen,
  },
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 10.5l3.2 3L15 6.5" />
    </svg>
  );
}

export function LandingView({
  c,
  catalog,
  promotions = [],
  preview = false,
  currency = "LKR",
}: {
  c: Landing;
  catalog: Catalog;
  promotions?: PublicPromotion[];
  preview?: boolean;
  currency?: Currency;
}) {
  const greeting = promotions.find((p) => p.kind === "greeting");
  const popup = promotions.find((p) => p.kind === "popup");
  return (
    <div className="min-h-screen">
      {greeting && <GreetingBar promo={greeting} preview={preview} />}
      <SiteHeader cta={c.hero.primaryCta} showPricing={c.pricing.show} />

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-16 lg:pb-24 lg:pt-16">
          <div>
            <KineticTitle text={c.hero.title} className="max-w-[14ch] text-[42px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[64px]" />
            <Reveal delay={550}>
              <p className="mt-6 max-w-[52ch] whitespace-pre-line text-lg leading-relaxed text-muted">{c.hero.subtitle}</p>
            </Reveal>
            <Reveal delay={700} className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-primary min-h-12 px-6 text-base">
                {c.hero.primaryCta}
              </Link>
              <a href="#how" className="btn btn-secondary min-h-12 px-6 text-base">
                See how it works
              </a>
            </Reveal>
            {c.hero.note && (
              <Reveal delay={800}>
                <p className="mt-4 text-sm text-muted">{c.hero.note}</p>
              </Reveal>
            )}
          </div>
          <Reveal delay={350}>
            <HeroShowcase />
          </Reveal>
        </section>

        {/* Where ratings come from */}
        <section aria-labelledby="channels" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 md:flex-row md:items-center md:gap-8">
            <h2 id="channels" className="shrink-0 font-sans text-sm font-semibold tracking-normal text-muted">
              Works with
            </h2>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-semibold">
              {CHANNELS.map((ch) => (
                <li key={ch}>{ch}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Signature band */}
        <section className="relative mx-auto max-w-6xl px-5 pt-20">
          <ScrollStatement text="Every tick is one customer, one tap, one honest answer." />
          <div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-[2px] bg-pos-fill" aria-hidden /> Happy (tall)
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-[2px] bg-neu-fill" aria-hidden /> Okay (medium)
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-[2px] bg-neg-fill" aria-hidden /> Unhappy (short)
              </span>
            </div>
          </div>
        </section>

        {/* How it works: scroll story */}
        <TapStory title={c.stepsTitle} steps={c.steps} />

        {/* Product showcase */}
        <section id="features" className="scroll-mt-20 bg-surface">
          <div className="mx-auto max-w-6xl space-y-24 px-5 py-24">
            {SHOWCASE.filter((x) => !x.localOnly || currency === "LKR").map(({ title, body, points, Screen }, i) => (
              <ShowcaseRow
                key={title}
                flip={i % 2 === 1}
                text={
                  <>
                    <h2 className="max-w-[18ch] text-[30px] font-bold leading-[1.1] sm:text-[38px]">{title}</h2>
                    <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted">{body}</p>
                    <ul className="mt-6 space-y-2.5">
                      {points.map((p) => (
                        <li key={p} className="flex gap-2.5">
                          <Check />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </>
                }
                screen={
                  <TiltCard>
                    <Screen />
                  </TiltCard>
                }
              />
            ))}
          </div>
        </section>

        {/* Also included (editable list) */}
        {c.features.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-[30px] font-bold leading-tight sm:text-[36px]">{c.featuresTitle}</h2>
            <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {c.features.map((f, i) => (
                <div key={i}>
                  <dt className="font-semibold">{f.title}</dt>
                  <dd className="mt-1 whitespace-pre-line text-muted">{f.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Trust */}
        <section className="px-5 pb-20">
          <div className="mx-auto grid max-w-6xl gap-8 rounded-[var(--radius-hero)] bg-ink p-8 text-white sm:p-12 lg:grid-cols-[auto_minmax(0,1fr)]">
            <IconShield className="h-12 w-12 text-[#9aa1ff]" />
            <div>
              <h2 className="text-[28px] font-bold leading-tight sm:text-[34px]">{c.trust.title}</h2>
              <p className="mt-3 max-w-[70ch] whitespace-pre-line text-[17px] leading-relaxed text-[#c9cdf0]">{c.trust.body}</p>
            </div>
          </div>
        </section>

        {c.pricing.show && (
          <section id="pricing" className="scroll-mt-20 border-t border-line bg-surface">
            <div className="mx-auto max-w-6xl px-5 py-20">
              <h2 className="text-[32px] font-bold leading-tight sm:text-[40px]">{c.pricing.title}</h2>
              {c.pricing.subtitle && <p className="mt-3 max-w-2xl text-[17px] text-muted">{c.pricing.subtitle}</p>}
              <div className="mt-8">
                <PricingTable catalog={catalog} defaultCurrency={currency} />
              </div>
            </div>
          </section>
        )}

        {c.faq.length > 0 && (
          <section id="faq" className="scroll-mt-20">
            <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <h2 className="text-[32px] font-bold leading-tight sm:text-[40px]">{c.faqTitle}</h2>
              <div className="divide-y divide-line border-y border-line">
                {c.faq.map((f, i) => (
                  <details key={i} className="group py-2">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                      {f.q}
                      <span aria-hidden className="text-2xl font-normal text-muted transition-transform duration-200 group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="pb-4 whitespace-pre-line text-muted">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Closing call to action */}
        <section className="bg-brand text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-20 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-[18ch] text-[34px] font-bold leading-[1.05] sm:text-[48px]">{c.finalCta.title}</h2>
            <div className="flex flex-col gap-2">
              <Link href="/signup" className="btn min-h-12 bg-white px-6 text-base text-brand hover:bg-[#eceeff]">
                {c.finalCta.button}
              </Link>
              {c.hero.note && <p className="text-sm text-[#dfe2ff]">{c.hero.note}</p>}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter tagline={c.footer.tagline} />
      {popup && !preview && <PromoPopup promo={popup} />}
    </div>
  );
}
