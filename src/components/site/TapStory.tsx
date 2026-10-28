"use client";
import { useEffect, useRef, useState } from "react";
import { ICON_SETS, type Sentiment } from "@/lib/surveys/iconSets";
import { FeedbackStripe } from "@/components/FeedbackStripe";

// "How it works" as a scroll story. The steps (editable in /admin) scroll past on the left while one
// pinned screen on the right acts out the step you're reading: the question is typed, the buttons are
// pasted into an email, a customer taps, the tick lands on the dashboard, and a bad rating becomes a
// follow-up. On phones each step carries its own small screen instead of a pinned one.
//
// Every animated element's normal style is its END state and the keyframes start from the beginning,
// so with reduced motion (animations off) or before a step plays, you simply see the finished picture.

const FACES = ICON_SETS.faces5.options;
const BASE: Sentiment[] = "ppnpppuppppppuppppnpppupppp".split("").map((c) => (c === "p" ? "positive" : c === "u" ? "neutral" : "negative"));
const items = (extra: Sentiment[] = []) => [...extra, ...BASE].map((sentiment) => ({ sentiment }));

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_30px_60px_-36px_rgba(16,21,61,0.45)]">
      <div className="flex items-center gap-2 border-b border-line bg-[#f8fafc] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e3e5ec]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e3e5ec]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e3e5ec]" />
        <span className="ml-2 truncate text-[12px] font-semibold text-muted">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Buttons({ size = "md", pop = false, pressed = false }: { size?: "sm" | "md"; pop?: boolean; pressed?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      {FACES.map((o, i) => (
        <span
          key={o.value}
          className={`relative flex flex-col items-center justify-center rounded-[8px] border-2 bg-white ${size === "sm" ? "min-w-11 px-1.5 py-1" : "min-w-12 px-2 py-1.5"} ${pop ? "st-pop" : ""} ${pressed && o.value === 5 ? "st-press" : ""}`}
          style={{ borderColor: o.color, animationDelay: pop ? `${450 + i * 110}ms` : undefined }}
        >
          <span className={size === "sm" ? "text-[18px] leading-[22px]" : "text-[22px] leading-[26px]"}>{o.symbol}</span>
          <span className="text-[10px] font-bold leading-[13px] text-[#374151]">{o.label}</span>
          {pressed && o.value === 5 && (
            <span className="st-pointer pointer-events-none absolute left-1/2 top-1/2 z-10">
              <svg width="24" height="28" viewBox="0 0 26 30">
                <path d="M3 2l19 13-8.5 1.6L18 26l-3.8 1.7-4.4-9.4L3 23.5z" fill="#0f172a" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function AskScene() {
  return (
    <Frame title="New survey">
      <div className="space-y-4 p-5">
        <div>
          <p className="mb-1.5 text-[13px] font-semibold">Question customers see</p>
          <div className="flex min-h-11 items-center rounded-[10px] border border-control bg-white px-3 text-[15px]">
            <span className="st-type inline-block whitespace-nowrap">How did we do with your order?</span>
            <span className="st-caret ml-0.5 inline-block h-5 w-[2px] bg-brand" />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-semibold">Rating buttons</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["5 faces", "😡 🙁 😐 🙂 😍"],
              ["3 faces", "🙁 😐 🙂"],
              ["Thumbs", "👎 👍"],
              ["Stars", "★★★★★"],
            ].map(([name, sym], i) => (
              <span key={name} className={`rounded-[10px] border p-2.5 ${i === 0 ? "st-select border-brand bg-brand-soft" : "border-line"}`}>
                <span className="block text-[12px] font-semibold">{name}</span>
                <span className="block truncate text-[15px]">{sym}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function PasteScene() {
  return (
    <div className="relative">
      <Frame title="New message">
        <div className="space-y-3 p-5 text-[14px]">
          <div className="space-y-1 border-b border-line pb-3 text-[13px] text-muted">
            <p>
              To: <span className="text-ink">amaya.perera@gmail.com</span>
            </p>
            <p>
              Subject: <span className="text-ink">Your delivery to Kandy</span>
            </p>
          </div>
          <div className="space-y-2" aria-hidden>
            <span className="block h-2.5 w-[92%] rounded-full bg-[#e9ebf1]" />
            <span className="block h-2.5 w-[84%] rounded-full bg-[#e9ebf1]" />
            <span className="block h-2.5 w-[60%] rounded-full bg-[#e9ebf1]" />
          </div>
          <p className="pt-1 text-[13px] text-muted">Thanks, Nimal · Kova Support</p>
          <div className="border-t border-dashed border-line pt-3">
            <p className="mb-2 text-[14px] font-bold" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
              How did we do with your order?
            </p>
            <Buttons pop />
          </div>
        </div>
      </Frame>
      <span className="st-chip absolute -right-2 -top-3 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg sm:-right-4">
        Pasted into your signature
      </span>
    </div>
  );
}

function TapScene() {
  return (
    <div className="space-y-3">
      <Frame title="Inbox · Amaya">
        <div className="p-5">
          <p className="mb-2 text-[14px] font-bold" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
            How did we do with your order?
          </p>
          <Buttons size="sm" pressed />
        </div>
      </Frame>
      <div className="ml-6 rounded-[16px] border border-line bg-surface p-5 shadow-[0_30px_60px_-40px_rgba(16,21,61,0.5)] sm:ml-12">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-muted">Your dashboard</p>
            <p className="relative font-display text-[32px] font-bold leading-none tabular">
              <span className="st-out absolute left-0 top-0">93</span>
              <span className="st-in">94</span>
              <span className="text-[18px] text-muted">% satisfied</span>
            </p>
          </div>
          <p className="st-in text-[12px] font-semibold text-pos-text">New rating: Excellent</p>
        </div>
        <div className="st-newest">
          <FeedbackStripe items={items(["positive"])} slots={32} height={48} />
        </div>
      </div>
    </div>
  );
}

function ActScene() {
  return (
    <div className="space-y-3">
      <div className="rounded-[16px] border border-line bg-surface p-5 shadow-[0_30px_60px_-40px_rgba(16,21,61,0.5)]">
        <p className="mb-3 text-[12px] font-semibold text-muted">Latest ratings</p>
        <div className="st-newest" style={{ ["--d" as string]: "0.35s" }}>
          <FeedbackStripe items={items(["negative", "positive"])} slots={32} height={48} />
        </div>
      </div>
      <div className="st-slide ml-6 overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_30px_60px_-36px_rgba(16,21,61,0.5)] sm:ml-12">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="text-[13px] font-semibold">Follow-up · Ruwan rated &ldquo;Very poor&rdquo;</p>
          <span className="st-resolved rounded-full bg-pos-soft px-2.5 py-0.5 text-[11px] font-bold text-pos-text">Resolved</span>
        </div>
        <div className="space-y-3 px-5 py-4 text-[13px]">
          <p className="rounded-[10px] bg-neg-soft px-3 py-2 text-neg-text">&ldquo;The parcel arrived with a broken seal.&rdquo;</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
            <span>
              Owner: <span className="font-semibold text-ink">Nimal</span>
            </span>
            <span>
              Due: <span className="font-semibold text-ink">within 2 days</span>
            </span>
          </div>
          <p className="st-note flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pos-fill text-[11px] text-white">✓</span>
            Called back and sent a replacement
          </p>
        </div>
      </div>
    </div>
  );
}

const SCENES = [AskScene, PasteScene, TapScene, ActScene];
const sceneFor = (i: number) => SCENES[Math.min(i, SCENES.length - 1)]!;

/** Plays a scene when `playing` is true; otherwise shows its finished picture. */
function Stage({ index, playing }: { index: number; playing: boolean }) {
  const Scene = sceneFor(index);
  return (
    <div key={`${index}-${playing}`} className={`st-stage ${playing ? "" : "st-still"}`} aria-hidden>
      <Scene />
    </div>
  );
}

export function TapStory({ title, steps }: { title: string; steps: Array<{ title: string; body: string }> }) {
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const refs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    // A step is "current" while it crosses the middle band of the screen.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.i);
          setActive(i);
          setSeen((s) => (s.has(i) ? s : new Set(s).add(i)));
        }
      },
      { rootMargin: "-42% 0px -42% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  return (
    <section id="how" className="scroll-mt-20" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <h2 id="how-title" className="max-w-[18ch] text-[32px] font-bold leading-tight sm:text-[44px]">
          {title}
        </h2>
        <div className="mt-6 grid gap-x-16 lg:mt-0 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <ol>
            {steps.map((s, i) => (
              <li
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-i={i}
                className={`flex flex-col justify-center border-t border-line py-10 transition-opacity duration-500 first:border-t-0 lg:min-h-[64vh] lg:border-t-0 ${
                  active === i ? "" : "lg:opacity-35"
                }`}
              >
                <span className="font-display text-[44px] font-bold leading-none text-brand" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-3 text-[22px] font-semibold leading-snug sm:text-[26px]">
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h3>
                <p className="mt-2 max-w-[42ch] whitespace-pre-line text-[17px] leading-relaxed text-muted">{s.body}</p>
                <div className="mt-8 lg:hidden">
                  <Stage index={i} playing={seen.has(i)} />
                </div>
              </li>
            ))}
          </ol>
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-15rem)] flex min-h-[30rem] flex-col justify-center">
              <Stage index={active} playing />
              <div className="mt-6 flex justify-center gap-2" aria-hidden>
                {steps.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${active === i ? "w-8 bg-brand" : "w-1.5 bg-line-strong"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
