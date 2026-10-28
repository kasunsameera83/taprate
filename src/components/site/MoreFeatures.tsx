"use client";
import { useEffect, useRef } from "react";

// "Built to grow with you": the smaller features as cards that rise in, one after another, when the
// section scrolls into view. Without JavaScript or with reduced motion they're simply shown.

type Card = { icon: string; title: string; body: string; visual: React.ReactNode; wide?: boolean };

const CARDS: Card[] = [
  {
    icon: "✉️",
    title: "Emails from your own domain",
    body: "On the Scale plan, survey emails come from feedback@yourbusiness.com instead of ours. Add a few DNS records and we check them for you.",
    visual: (
      <p className="truncate rounded-[8px] border border-line bg-[#f8fafc] px-2.5 py-1.5 font-mono text-[12px]">
        From: Lanka Bakes &lt;feedback@lankabakes.lk&gt; <span className="ml-1 text-pos-text">✓ Verified</span>
      </p>
    ),
    wide: true,
  },
  {
    icon: "🔁",
    title: "Repeat sends",
    body: "Ask the same customers again every 30, 60 or 90 days, automatically. Unsubscribes are always respected.",
    visual: (
      <div className="flex gap-1.5">
        {["Jan", "Apr", "Jul", "Oct"].map((m) => (
          <span key={m} className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand">
            {m}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: "🧾",
    title: "Customer history",
    body: "Click any customer to see every rating and comment they've ever given you, before you pick up the phone.",
    visual: (
      <div className="flex items-center gap-1.5" aria-hidden>
        {["😍", "🙂", "😞", "😍"].map((f, i) => (
          <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-[14px]">
            {f}
          </span>
        ))}
        <span className="ml-1 text-[12px] text-muted">since March</span>
      </div>
    ),
  },
  {
    icon: "🏢",
    title: "Run many businesses",
    body: "Agencies, groups and franchise owners see every business on one page: ratings, open follow-ups and responses left.",
    visual: (
      <div className="space-y-1 text-[12px]">
        {[
          ["Colombo Café", "96%"],
          ["Galle Clinic", "88%"],
          ["Kandy Motors", "74%"],
        ].map(([n, p]) => (
          <p key={n} className="flex justify-between rounded-[6px] bg-[#f8fafc] px-2 py-1">
            <span className="font-semibold">{n}</span>
            <span className="tabular text-muted">{p}</span>
          </p>
        ))}
      </div>
    ),
    wide: true,
  },
  {
    icon: "🚀",
    title: "Ready in minutes",
    body: "A short checklist walks you through your first survey, and sample data shows what your dashboard will look like.",
    visual: (
      <div className="space-y-1 text-[12px]">
        {["Create a survey", "Add the buttons", "Get your first rating"].map((s, i) => (
          <p key={s} className="flex items-center gap-2">
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${i < 2 ? "bg-pos-fill text-white" : "border border-line"}`}>{i < 2 ? "✓" : ""}</span>
            <span className={i < 2 ? "text-muted line-through" : "font-semibold"}>{s}</span>
          </p>
        ))}
      </div>
    ),
  },
  {
    icon: "🎁",
    title: "Invite a business, both get 250",
    body: "Share your link. When a business you invite makes its first payment, you each get 250 bonus responses.",
    visual: (
      <p className="inline-flex items-center gap-2 rounded-full bg-pos-soft px-3 py-1 text-[12px] font-bold text-pos-text">
        +250 responses for you <span aria-hidden>·</span> +250 for them
      </p>
    ),
  },
];

export function MoreFeatures() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.ready = "1"; // hide the cards only once we know we can show them again
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.in = "1";
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section aria-labelledby="grow-title" className="mx-auto max-w-6xl px-5 py-20">
      <h2 id="grow-title" className="max-w-[20ch] text-[30px] font-bold leading-tight sm:text-[38px]">
        Built to grow with you
      </h2>
      <p className="mt-3 max-w-[56ch] text-[17px] text-muted">From your first survey to a group of businesses, the details are taken care of.</p>
      <div ref={ref} className="lp-cards mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c, i) => (
          <article
            key={c.title}
            className={`lp-card group rounded-[var(--radius-panel)] border border-line bg-surface p-5 hover:shadow-[0_20px_40px_-28px_rgba(16,21,61,0.45)] ${c.wide ? "lg:col-span-2" : ""}`}
            style={{ "--d": `${i * 80}ms` } as React.CSSProperties}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-brand-soft text-[20px] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" aria-hidden>
              {c.icon}
            </span>
            <h3 className="mt-4 text-[18px] font-bold">{c.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{c.body}</p>
            <div className="mt-4" aria-hidden>
              {c.visual}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
