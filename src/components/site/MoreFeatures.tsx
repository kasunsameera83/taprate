"use client";
import { useEffect, useRef } from "react";

// "Built to grow with you": the smaller features as cards that rise in, one after another, when the
// section scrolls into view. Without JavaScript or with reduced motion they're simply shown.

type Card = { icon: React.ReactNode; title: string; body: string; visual: React.ReactNode; wide?: boolean };

// Line icons (24px grid, 2px stroke, round joins), drawn inline: no icon font or external requests.
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const I = {
  mail: <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>,
  repeat: <Svg><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></Svg>,
  history: <Svg><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Svg>,
  building: <Svg><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" /><path d="M10 21v-3h4v3" /></Svg>,
  rocket: <Svg><path d="M5 15c-1.5 1.3-2 4-2 6 2 0 4.7-.5 6-2" /><path d="M14.5 4.5C17 2 20 2 22 2c0 2 0 5-2.5 7.5L12 17l-5-5 7.5-7.5Z" /><path d="M12 7H7l-3 3 3 2M17 12v5l-3 3-2-3" /></Svg>,
  reply: <Svg><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="m10 9-3 3 3 3" /><path d="M7 12h6a3 3 0 0 1 3 3" /></Svg>,
  chart: <Svg><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="5" rx="0.5" /><rect x="12" y="8" width="3" height="9" rx="0.5" /><rect x="17" y="5" width="3" height="12" rx="0.5" /></Svg>,
  sparkles: <Svg><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4Z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" /></Svg>,
  megaphone: <Svg><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1Z" /><path d="M17 9a4 4 0 0 1 0 6" /><path d="M7 14l1.5 5h2.5L10 15" /></Svg>,
  globe: <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" /></Svg>,
  bell: <Svg><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Svg>,
  gift: <Svg><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></Svg>,
};


const CARDS: Card[] = [
  {
    icon: I.mail,
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
    icon: I.repeat,
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
    icon: I.history,
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
    icon: I.building,
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
    icon: I.rocket,
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
    icon: I.reply,
    title: "Reply right from TapTruly",
    body: "Write back to an unhappy customer from the follow-up, or let AI draft it. Their answer lands in your inbox, and the reply is saved on their history.",
    visual: (
      <div className="space-y-1.5 text-[12px]">
        <p className="rounded-[10px] rounded-bl-[3px] bg-[#f1f5f9] px-3 py-1.5">&ldquo;Delivery took two weeks.&rdquo;</p>
        <p className="ml-6 rounded-[10px] rounded-br-[3px] bg-brand px-3 py-1.5 text-white">So sorry! Your refund is on its way.</p>
      </div>
    ),
    wide: true,
  },
  {
    icon: I.chart,
    title: "See how you compare",
    body: "Your happy customers against the average for businesses like yours. Only averages are shared, never anyone's own numbers.",
    visual: (
      <div className="space-y-1.5 text-[12px]">
        {[
          ["You", 92, "bg-pos-fill"],
          ["Restaurants", 85, "bg-[#cbd5e1]"],
        ].map(([n, p, c]) => (
          <p key={n as string} className="flex items-center gap-2">
            <span className="w-20 font-semibold">{n}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1f5f9]">
              <span className={`block h-full rounded-full ${c}`} style={{ width: `${p}%` }} />
            </span>
            <span className="tabular w-9 text-right text-muted">{p}%</span>
          </p>
        ))}
      </div>
    ),
  },
  {
    icon: I.sparkles,
    title: "Share your best month",
    body: "One tap makes a picture of your month: ratings, % happy and a kind word from a customer, ready for Facebook, Instagram and WhatsApp.",
    visual: (
      <p className="inline-flex items-baseline gap-2 rounded-[12px] bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-3 py-2 text-white">
        <span className="text-[20px] font-bold">94%</span>
        <span className="text-[12px]">happy in October · 312 ratings</span>
      </p>
    ),
  },
  {
    icon: I.megaphone,
    title: "Happy reviews, ready to post",
    body: "When a customer agrees, turn their comment into a branded picture card for social media in one click.",
    visual: (
      <p className="rounded-[10px] border border-line bg-white px-3 py-2 text-[12px]">
        <span className="text-[#f59e0b]">★★★★★</span> &ldquo;Best service in town!&rdquo; <span className="text-muted">— Janaka</span>
      </p>
    ),
  },
  {
    icon: I.globe,
    title: "Your own web address",
    body: "On the Scale plan, survey pages, QR codes and links use your address, like feedback.yourbusiness.com. On Growth and Scale you can remove our name too.",
    visual: (
      <p className="truncate rounded-[8px] border border-line bg-[#f8fafc] px-2.5 py-1.5 font-mono text-[12px]">
        🔒 feedback.lankabakes.lk/thanks
      </p>
    ),
    wide: true,
  },
  {
    icon: I.bell,
    title: "Live, without refreshing",
    body: "New ratings pop up while you work, the dashboard updates by itself, and the bell shows what needs you.",
    visual: (
      <p className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-white px-3 py-2 text-[12px] shadow-sm">
        <span className="h-2 w-2 rounded-full bg-pos-fill" aria-hidden /> New rating: Excellent · just now
      </p>
    ),
  },
  {
    icon: I.gift,
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
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-brand-soft text-brand ring-1 ring-brand/10 transition duration-300 group-hover:scale-105 group-hover:bg-brand group-hover:text-white" aria-hidden>
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
