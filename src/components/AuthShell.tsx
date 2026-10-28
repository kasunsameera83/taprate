import Link from "next/link";
import { Logo } from "./icons";
import { EmailButtonsPreview } from "./SurveyPreview";
import { FeedbackStripe } from "./FeedbackStripe";
import type { Sentiment } from "@/lib/surveys/iconSets";

const SAMPLE: Sentiment[] = "pppnpppppnpppupppppppnpppp".split("").map((c) => (c === "p" ? "positive" : c === "n" ? "neutral" : "negative"));

/** Two-column auth layout: the form, and a calm picture of what the product does. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="self-start" aria-label="TapTruly home">
          <Logo />
        </Link>
        <div className="mx-auto my-auto w-full max-w-sm py-10">
          <h1 className="text-[30px] font-bold leading-tight">{title}</h1>
          <p className="mt-1 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-sm text-muted">{footer}</div>
        </div>
      </main>
      <aside className="hidden flex-col justify-center gap-8 border-l border-line bg-surface px-12 py-12 lg:flex" aria-hidden>
        <div className="mx-auto w-full max-w-md space-y-8">
          <p className="font-display text-[28px] font-bold leading-snug">Every email you send can tell you how the customer felt.</p>
          <div className="rounded-[14px] border border-line bg-canvas p-5">
            <p className="mb-3 text-sm text-[#1f2937]">Thanks for your patience today. Your refund is on its way.</p>
            <EmailButtonsPreview iconSet="faces5" question="How did we do?" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-muted">Today&rsquo;s ratings</p>
            <FeedbackStripe items={SAMPLE.map((s) => ({ sentiment: s }))} slots={26} height={48} />
          </div>
        </div>
      </aside>
    </div>
  );
}
