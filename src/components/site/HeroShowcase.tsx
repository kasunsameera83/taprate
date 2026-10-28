"use client";
import { useEffect, useRef, useState } from "react";
import { ICON_SETS, sentimentOf, type Sentiment } from "@/lib/surveys/iconSets";
import { FeedbackStripe } from "@/components/FeedbackStripe";

const START: Sentiment[] = "ppnppppupppnpppppppnppupppp".split("").map((c) => (c === "p" ? "positive" : c === "n" ? "neutral" : "negative"));

/**
 * The one orchestrated moment on the page: a customer's email arrives, a pointer taps "Excellent", and the
 * rating drops onto the business's dashboard. Plays once; after that, visitors can tap the faces themselves.
 * With "reduce motion" switched on, nothing moves; the demo is simply ready to try.
 */
export function HeroShowcase() {
  const set = ICON_SETS.faces5;
  const [items, setItems] = useState<Array<{ sentiment: Sentiment }>>(START.map((s) => ({ sentiment: s })).reverse());
  const [last, setLast] = useState("");
  const [pressed, setPressed] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number; visible: boolean; tap: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLButtonElement>(null);
  const touched = useRef(false);

  const positive = items.filter((i) => i.sentiment === "positive").length;
  const pct = Math.round((positive / items.length) * 100);

  function rate(value: number, label: string) {
    setItems((prev) => [{ sentiment: sentimentOf("faces5", value) }, ...prev]);
    setLast(label);
    setPressed(value);
    setTimeout(() => setPressed(null), 260);
  }

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => !touched.current && fn(), ms));
    at(900, () => {
      const b = box.current?.getBoundingClientRect();
      const t = target.current?.getBoundingClientRect();
      if (!b || !t) return;
      setPointer({ x: b.width - 30, y: b.height - 20, visible: true, tap: false });
      at(80, () => setPointer({ x: t.left - b.left + t.width / 2, y: t.top - b.top + t.height / 2, visible: true, tap: false }));
    });
    at(1900, () => setPointer((p) => (p ? { ...p, tap: true } : p)));
    at(2050, () => rate(5, "Excellent"));
    at(2500, () => setPointer((p) => (p ? { ...p, tap: false, visible: false } : p)));
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className="relative" onPointerDown={() => (touched.current = true)}>
      <div className="overflow-hidden rounded-[18px] border border-line bg-white shadow-[0_30px_60px_-36px_rgba(16,21,61,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-[#fafbfc] px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">Re: Your delivery to Kandy</p>
            <p className="text-[12px] text-muted">Nimal from Kova Support</p>
          </div>
          <span className="shrink-0 text-[12px] text-muted">9:41</span>
        </div>
        <div className="space-y-3 px-5 py-5 text-[14px] leading-relaxed text-[#1f2937]">
          <p>Hi Amaya, your parcel was re-routed and will arrive tomorrow morning. Sorry for the wait, and thanks for your patience.</p>
          <div className="border-t border-dashed border-line pt-3">
            <p className="mb-2 font-bold text-[#111827]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
              How did we do?
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Try it: rate this email">
              {set.options.map((o) => (
                <button
                  key={o.value}
                  ref={o.value === 5 ? target : undefined}
                  type="button"
                  onClick={() => {
                    touched.current = true;
                    rate(o.value, o.label);
                  }}
                  className={`flex min-h-11 min-w-12 flex-col items-center justify-center rounded-[8px] border-2 bg-white px-2 py-1.5 transition-transform duration-150 ${pressed === o.value ? "scale-90" : ""}`}
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

      <div className="relative z-10 -mt-4 ml-6 rounded-[18px] border border-line bg-surface p-5 shadow-[0_30px_60px_-40px_rgba(16,21,61,0.5)] sm:ml-14">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-muted">Your dashboard</p>
            <p className="font-display text-[32px] font-bold leading-none tabular">
              {pct}
              <span className="text-[18px] text-muted">% satisfied</span>
            </p>
          </div>
          <p className="text-right text-[12px] text-muted" aria-live="polite">
            {last ? (
              <span className="font-semibold text-pos-text">New rating: {last}</span>
            ) : (
              "Tap a face above"
            )}
          </p>
        </div>
        <FeedbackStripe items={items} slots={36} height={52} highlightNewest={Boolean(last)} />
      </div>

      {pointer && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-20 transition-[transform,opacity] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translate(${pointer.x - 6}px, ${pointer.y - 4}px) scale(${pointer.tap ? 0.85 : 1})`, opacity: pointer.visible ? 1 : 0 }}
        >
          <svg width="26" height="30" viewBox="0 0 26 30">
            <path d="M3 2l19 13-8.5 1.6L18 26l-3.8 1.7-4.4-9.4L3 23.5z" fill="#151a2d" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          {pointer.tap && <span className="absolute -left-3 -top-3 h-8 w-8 animate-ping rounded-full bg-brand/30" />}
        </span>
      )}
    </div>
  );
}
