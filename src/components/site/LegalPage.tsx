import { COMPANY, hasPlaceholders } from "@/lib/site/company";
import { SiteHeader } from "./SiteHeader";
import { SiteFooterAuto } from "./SiteFooterAuto";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        {hasPlaceholders() && (
          <div role="note" className="mb-6 rounded-[12px] border border-[#f0c5c5] bg-neg-soft p-3 text-sm text-neg-text">
            Business details still need filling in (src/lib/site/company.ts).
          </div>
        )}
        <article className="legal space-y-4 text-[16px] leading-relaxed">
          <h1 className="text-[36px] font-bold leading-tight">{title}</h1>
          <p className="text-sm text-muted">Effective {COMPANY.effectiveDate}</p>
          {children}
        </article>
      </main>
      <SiteFooterAuto />
    </div>
  );
}
