import Link from "next/link";
import type { Catalog } from "@/lib/billing/catalog";
import type { Landing, PublicPromotion } from "@/lib/site/content";
import { Logo, IconShield } from "@/components/icons";
import { HeroDemo } from "@/app/HeroDemo";
import { PricingTable } from "./PricingTable";
import { GreetingBar, PromoPopup } from "./Promotions";

// The public landing page, drawn from editable content. All text is rendered as text (React escapes it).
// Used by "/" and by the admin preview.
export function LandingView({ c, catalog, promotions = [], preview = false }: { c: Landing; catalog: Catalog; promotions?: PublicPromotion[]; preview?: boolean }) {
  const greeting = promotions.find((p) => p.kind === "greeting");
  const popup = promotions.find((p) => p.kind === "popup");
  return (
    <div className="min-h-screen">
      {greeting && <GreetingBar promo={greeting} preview={preview} />}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {c.pricing.show && (
            <a href="#pricing" className="btn btn-ghost hidden sm:inline-flex">
              Pricing
            </a>
          )}
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            {c.hero.primaryCta}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:pt-16">
          <div>
            <h1 className="text-[40px] font-bold leading-[1.05] sm:text-[56px]">{c.hero.title}</h1>
            <p className="mt-5 max-w-xl whitespace-pre-line text-lg text-muted">{c.hero.subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-primary min-h-12 px-6 text-base">
                {c.hero.primaryCta}
              </Link>
              <Link href="/login" className="btn btn-secondary min-h-12 px-6 text-base">
                Sign in
              </Link>
            </div>
            {c.hero.note && <p className="mt-4 text-sm text-muted">{c.hero.note}</p>}
          </div>
          <HeroDemo />
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-[28px] font-bold">{c.stepsTitle}</h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {c.steps.map((s, i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand">{i + 1}</span>
                  <div>
                    <h3 className="font-sans text-base font-semibold tracking-normal">{s.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {c.features.length > 0 && (
          <section className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-[28px] font-bold">{c.featuresTitle}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.features.map((f, i) => (
                <div key={i} className="panel p-5">
                  <h3 className="font-sans text-base font-semibold tracking-normal">{f.title}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="flex flex-col gap-4 rounded-[var(--radius-hero)] border border-line bg-surface p-6 sm:flex-row sm:items-start sm:p-8">
            <IconShield className="h-8 w-8 shrink-0 text-brand" />
            <div>
              <h2 className="text-xl font-bold">{c.trust.title}</h2>
              <p className="mt-2 max-w-3xl whitespace-pre-line text-muted">{c.trust.body}</p>
            </div>
          </div>
        </section>

        {c.pricing.show && (
          <section id="pricing" className="scroll-mt-6 border-t border-line">
            <div className="mx-auto max-w-6xl px-5 py-16">
              <h2 className="text-[28px] font-bold">{c.pricing.title}</h2>
              {c.pricing.subtitle && <p className="mt-2 max-w-2xl text-muted">{c.pricing.subtitle}</p>}
              <div className="mt-6">
                <PricingTable catalog={catalog} />
              </div>
            </div>
          </section>
        )}

        {c.faq.length > 0 && (
          <section className="border-t border-line bg-surface">
            <div className="mx-auto max-w-3xl px-5 py-16">
              <h2 className="text-[28px] font-bold">{c.faqTitle}</h2>
              <div className="mt-6 divide-y divide-line">
                {c.faq.map((f, i) => (
                  <details key={i} className="group py-4">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                      {f.q}
                      <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-2 whitespace-pre-line text-muted">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="text-[28px] font-bold">{c.finalCta.title}</h2>
          <Link href="/signup" className="btn btn-primary mt-6 min-h-12 px-6 text-base">
            {c.finalCta.button}
          </Link>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
          <div className="flex items-center gap-3">
            <Logo />
            {c.footer.tagline && <span>{c.footer.tagline}</span>}
          </div>
          <span>&copy; {new Date().getFullYear()} TapRate</span>
        </div>
      </footer>
      {popup && !preview && <PromoPopup promo={popup} />}
    </div>
  );
}
