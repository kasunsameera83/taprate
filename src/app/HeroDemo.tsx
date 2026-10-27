"use client";
import { useState } from "react";
import { ICON_SETS, sentimentOf, type Sentiment } from "@/lib/surveys/iconSets";
import { FeedbackStripe } from "@/components/FeedbackStripe";

const START: Sentiment[] = "ppnppppupppnppppppnp".split("").map((c) => (c === "p" ? "positive" : c === "n" ? "neutral" : "negative"));

/** A pretend email you can actually click: each tap drops a new tick onto the stripe. Purely client-side. */
export function HeroDemo() {
  const [items, setItems] = useState<Array<{ sentiment: Sentiment }>>(START.map((s) => ({ sentiment: s })).reverse());
  const [last, setLast] = useState<string>("");
  const set = ICON_SETS.faces5;

  function rate(value: number, label: string) {
    setItems((prev) => [{ sentiment: sentimentOf("faces5", value) }, ...prev]);
    setLast(label);
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[18px] border border-line bg-white shadow-[0_24px_48px_-28px_rgba(21,26,45,0.35)]">
        <div className="border-b border-line bg-[#fafbfc] px-5 py-3">
          <p className="text-[13px] font-semibold">Re: Delivery to Kandy</p>
          <p className="text-[12px] text-muted">From Nimal, Kova Support</p>
        </div>
        <div className="space-y-3 px-5 py-5 text-[14px] leading-relaxed text-[#1f2937]">
          <p>Hi Amaya, your parcel was re-routed and will arrive tomorrow morning. Sorry for the wait.</p>
          <div className="border-t border-dashed border-line pt-3">
            <p className="mb-2 font-bold text-[#111827]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
              How did we do?
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Try rating this email">
              {set.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => rate(o.value, o.label)}
                  className="flex min-h-11 min-w-12 flex-col items-center justify-center rounded-[8px] border-2 bg-white px-2 py-1.5 transition-transform active:scale-95"
                  style={{ borderColor: o.color, fontFamily: "Arial, Helvetica, sans-serif" }}
                  aria-label={`Rate: ${o.label}`}
                >
                  <span className="text-[22px] leading-[26px]" aria-hidden>
                    {o.symbol}
                  </span>
                  <span className="text-[11px] font-bold leading-[14px] text-[#374151]" aria-hidden>
                    {o.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-[18px] border border-line bg-surface p-5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">Your dashboard</p>
          <p className="text-[13px] text-muted" aria-live="polite">
            {last ? `New rating: ${last}` : "Tap a face above"}
          </p>
        </div>
        <FeedbackStripe items={items} slots={36} height={56} highlightNewest={Boolean(last)} />
      </div>
    </div>
  );
}
