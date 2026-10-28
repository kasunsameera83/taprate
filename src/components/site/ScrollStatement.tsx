"use client";
import { useRef } from "react";
import { useScrollVar } from "./motion";

// "Every tick is one customer…": as you scroll, the words fill in one by one and the stripe below rises
// tick by tick, left to right. Driven by one CSS variable (--p, 0 to 1), so React never re-renders on scroll.

const TICKS = 140;
const POS = "var(--color-pos-fill)";
const NEU = "var(--color-neu-fill)";
const NEG = "var(--color-neg-fill)";

function pattern(n: number, seed: number) {
  const out: Array<"p" | "u" | "n"> = [];
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const r = x / 233280;
    out.push(r < 0.09 ? "n" : r < 0.27 ? "u" : "p");
  }
  return out;
}
const TICK_PATTERN = pattern(TICKS, 23);
const COLOR = { p: POS, u: NEU, n: NEG } as const;
const H = { p: "100%", u: "66%", n: "40%" } as const;

export function ScrollStatement({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollVar(ref, "--p", 0.95, 0.3);
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div ref={ref} className="scroll-statement" style={{ ["--n" as string]: words.length, ["--t" as string]: TICKS }}>
      <p className="font-display max-w-[20ch] text-[34px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[52px]">
        {words.map((w, i) => (
          <span key={i}>
            <span className="ss-word" style={{ ["--i" as string]: i }}>
              {w}
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
      <div className="mt-10 flex h-28 items-end gap-[3px] px-1" aria-hidden>
        {TICK_PATTERN.map((s, i) => (
          <span key={i} className="ss-tick min-w-[3px] flex-1 rounded-t-[3px]" style={{ height: H[s], background: COLOR[s], ["--i" as string]: i }} />
        ))}
      </div>
    </div>
  );
}
