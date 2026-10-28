"use client";
import { useEffect, useRef, useState } from "react";
import { ICON_SETS } from "@/lib/surveys/iconSets";

// Landing page: the standard faces turn into a café's own coffee-cup pictures and words, and back, in a
// gentle loop. The loop only runs while it's on screen, stops while you hover or focus it, has a pause
// button, and doesn't run at all for people who've asked for reduced motion.

const LABELS = ["Cold", "Meh", "Okay", "Tasty", "Perfect brew"];

/** A coffee cup whose steam and smile grow with the rating (an example of a business's own picture). */
function Cup({ level }: { level: number }) {
  const mouth = ["M15 31q5-4 10 0", "M15 30q5-2 10 0", "M15 29h10", "M15 28q5 3 10 0", "M14 27q6 5 12 0"][level - 1];
  return (
    <svg viewBox="0 0 40 44" className="h-11 w-11" aria-hidden>
      {Array.from({ length: Math.max(0, level - 1) }, (_, i) => (
        <path key={i} d={`M${12 + i * 5} 9c-2-2 2-4 0-6`} fill="none" stroke="#9aa1b5" strokeWidth="1.8" strokeLinecap="round" />
      ))}
      <path d="M6 14h26l-2.6 21a5 5 0 0 1-5 4.4H13.6a5 5 0 0 1-5-4.4z" fill="#f6e7d4" stroke="#6b3f1d" strokeWidth="2" strokeLinejoin="round" />
      <path d="M31.4 18h2.4a4 4 0 0 1 0 8h-3.2" fill="none" stroke="#6b3f1d" strokeWidth="2" />
      <circle cx="15.5" cy="23" r="1.6" fill="#6b3f1d" />
      <circle cx="24.5" cy="23" r="1.6" fill="#6b3f1d" />
      <path d={mouth} fill="none" stroke="#6b3f1d" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMorph() {
  const set = ICON_SETS.faces5;
  const [custom, setCustom] = useState(true);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || paused || hovering || !visible) return;
    const t = setInterval(() => setCustom((c) => !c), 2600);
    return () => clearInterval(t);
  }, [reduced, paused, hovering, visible]);

  return (
    <div
      ref={box}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_30px_60px_-36px_rgba(16,21,61,0.45)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-[#f8fafc] px-4 py-2.5">
        <span className="text-[12px] font-semibold text-muted">Survey settings · Your own pictures</span>
        {!reduced && (
          <button type="button" className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? "Play" : "Pause"} animation
          </button>
        )}
      </div>

      <div className="p-5">
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-dashed border-line-strong bg-canvas px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white">
            <Cup level={5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">kova-cups.png</span>
            <span className="block text-[12px] text-muted">Checked: still image, 256×256, 38 KB, location data removed</span>
          </span>
          <span className="rounded-full bg-pos-soft px-2 py-0.5 text-[11px] font-bold text-pos-text">Ready</span>
        </div>

        <p className="mb-3 text-center font-bold" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
          How was your coffee today?
        </p>
        {/* Both versions are drawn; they cross-fade so nothing jumps. Screen readers get the current one. */}
        <div className="relative" aria-live="off">
          {[false, true].map((isCustom) => (
            <div
              key={String(isCustom)}
              className={`flex flex-wrap justify-center gap-1.5 transition-[opacity,transform] duration-700 ease-out ${isCustom === custom ? "opacity-100" : "pointer-events-none absolute inset-0 opacity-0"} ${
                isCustom === custom ? "translate-y-0" : isCustom ? "translate-y-1" : "-translate-y-1"
              }`}
              aria-hidden={isCustom !== custom}
            >
              {set.options.map((o, i) => (
                <span
                  key={o.value}
                  className="flex min-h-[76px] min-w-[58px] flex-col items-center justify-center rounded-[10px] border-2 bg-white px-1.5 py-1.5"
                  style={{ borderColor: o.color, fontFamily: "Arial, Helvetica, sans-serif" }}
                >
                  {isCustom ? <Cup level={o.value} /> : <span className="text-[30px] leading-[44px]">{o.symbol}</span>}
                  <span className="text-[11px] font-bold leading-[14px] text-[#374151]">{isCustom ? LABELS[i] : o.label}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[12px] text-muted" aria-live="polite">
          {custom ? "Kova Café's own cups and words" : "Standard faces"}
        </p>
      </div>
    </div>
  );
}
