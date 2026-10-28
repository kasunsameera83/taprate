// Product pictures for the landing page, drawn with the app's own styles instead of image files:
// always sharp, always in step with the real design, and nothing for the CSP to load.
// Each one is a single labelled image for screen readers.
import { encodeQr } from "@/lib/qr";

const POS = "var(--color-pos-fill)";
const NEU = "var(--color-neu-fill)";
const NEG = "var(--color-neg-fill)";

/** The app frame: a thin bar with three dots and the page name, like a browser window. */
export function AppWindow({ title, label, children, className = "" }: { title: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="img" aria-label={label} className={`overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_30px_60px_-36px_rgba(16,21,61,0.45)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-line bg-[#fafbfc] px-4 py-2.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#e3e5ec]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e3e5ec]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e3e5ec]" />
        <span className="ml-2 truncate text-[12px] font-semibold text-muted">{title}</span>
      </div>
      <div aria-hidden>{children}</div>
    </div>
  );
}

// A fixed, believable pattern of ratings (deterministic, so server and browser draw the same thing).
function pattern(n: number, seed: number, negEvery = 9, neuEvery = 5): Array<"p" | "u" | "n"> {
  const out: Array<"p" | "u" | "n"> = [];
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const r = x / 233280;
    out.push(r < 1 / negEvery ? "n" : r < 1 / negEvery + 1 / neuEvery ? "u" : "p");
  }
  return out;
}
const COLOR = { p: POS, u: NEU, n: NEG } as const;
const H = { p: "100%", u: "66%", n: "40%" } as const;

export function MiniStripe({ n = 40, seed = 7, height = 44 }: { n?: number; seed?: number; height?: number }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {pattern(n, seed).map((s, i) => (
        <span key={i} className="min-w-0 flex-1 rounded-[2px]" style={{ height: H[s], background: COLOR[s] }} />
      ))}
    </div>
  );
}

export function DashboardScreen() {
  const days = [62, 70, 55, 80, 74, 90, 66, 85, 78, 92, 70, 88, 95, 81];
  return (
    <AppWindow title="Dashboard" label="TapRate dashboard: 94% of customers satisfied this month, up 3 points, with a bar of recent ratings and the most-picked reasons.">
      <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          <p className="text-[12px] font-semibold text-muted">Customer satisfaction</p>
          <p className="font-display text-[56px] font-bold leading-none tracking-tight">
            94<span className="text-[28px] text-muted">%</span>
          </p>
          <p className="mt-1 text-[12px] font-semibold text-pos-text">Up 3 points on last month</p>
          <p className="text-[12px] text-muted">412 of 438 ratings were positive</p>
        </div>
        <div>
          <p className="mb-2 text-[12px] font-semibold text-muted">Ratings per day</p>
          <div className="flex h-24 items-end gap-1">
            {days.map((d, i) => (
              <span key={i} className="flex-1 rounded-t-[3px] bg-brand" style={{ height: `${d}%`, opacity: i === days.length - 1 ? 1 : 0.35 + (i / days.length) * 0.5 }} />
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-2 text-[12px] font-semibold text-muted">Latest ratings</p>
          <MiniStripe n={48} seed={11} />
        </div>
        <div className="flex flex-wrap gap-1.5 sm:col-span-2">
          {[
            ["Fast reply", 128],
            ["Friendly", 96],
            ["Solved first time", 71],
          ].map(([l, c]) => (
            <span key={l} className="rounded-full bg-pos-soft px-2.5 py-1 text-[12px] font-semibold text-pos-text">
              {l} {c}
            </span>
          ))}
          <span className="rounded-full bg-neg-soft px-2.5 py-1 text-[12px] font-semibold text-neg-text">Slow delivery 14</span>
        </div>
      </div>
    </AppWindow>
  );
}

export function FollowUpScreen() {
  const rows = [
    { who: "kasun@…", rating: "😞 Very poor", note: "Parcel arrived damaged", owner: "NP", due: "Overdue", tone: "neg" },
    { who: "Ticket #1087", rating: "🙁 Poor", note: "Waited 3 days for reply", owner: "AK", due: "Due today", tone: "neu" },
    { who: "dilani@…", rating: "🙁 Poor", note: "Called back, refund sent", owner: "NP", due: "Resolved", tone: "pos" },
  ] as const;
  const chip = { neg: "bg-neg-soft text-neg-text", neu: "bg-neu-soft text-neu-text", pos: "bg-pos-soft text-pos-text" };
  return (
    <AppWindow title="Follow-ups" label="Follow-ups list: unhappy ratings each have an owner and a due date; one overdue, one due today, one resolved.">
      <div className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.who} className="flex items-center gap-3 px-5 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">{r.owner}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">
                {r.rating} <span className="font-normal text-muted">from {r.who}</span>
              </p>
              <p className="truncate text-[12px] text-muted">{r.note}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip[r.tone]}`}>{r.due}</span>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

function Qr({ text, size = 132 }: { text: string; size?: number }) {
  const m = encodeQr(text);
  const n = m.length + 8;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" aria-hidden>
      <rect width={n} height={n} fill="#fff" />
      {m.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x + 4} y={y + 4} width={1} height={1} fill="#151a2d" /> : null)))}
    </svg>
  );
}

export function ChannelsScreen() {
  return (
    <div role="img" aria-label="A QR code on a printed counter card, and a phone showing the one-tap rating page it opens." className="relative flex items-end justify-center gap-6 py-4">
      <div aria-hidden className="rounded-[16px] border border-line bg-surface p-5 text-center shadow-[0_30px_60px_-36px_rgba(16,21,61,0.45)]">
        <p className="font-display text-lg font-bold">How did we do?</p>
        <p className="mb-3 text-[12px] text-muted">Scan to rate your visit</p>
        <Qr text="https://taprate.app" />
      </div>
      <div aria-hidden className="w-[190px] rounded-[30px] border-[6px] border-[#10153d] bg-surface p-4 shadow-[0_30px_60px_-30px_rgba(16,21,61,0.6)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#e3e5ec]" />
        <p className="text-center text-[12px] text-muted">Kova Café</p>
        <p className="mt-1 text-center font-display text-[15px] font-bold leading-snug">How was your visit today?</p>
        <div className="mt-4 grid grid-cols-5 gap-1">
          {["😞", "🙁", "😐", "🙂", "😀"].map((f, i) => (
            <span key={f} className={`flex aspect-square items-center justify-center rounded-[8px] border-2 text-[18px] ${i === 4 ? "border-pos-fill bg-pos-soft" : "border-line"}`}>
              {f}
            </span>
          ))}
        </div>
        <p className="mt-4 rounded-[8px] bg-pos-soft py-2 text-center text-[12px] font-semibold text-pos-text">Thanks! Rated Excellent</p>
      </div>
    </div>
  );
}

export function InsightsScreen() {
  return (
    <AppWindow title="Insights" label="An AI summary: customers love fast replies, but delivery to the hill country is slow; with a real quote and suggested actions.">
      <div className="space-y-3 p-5">
        <p className="text-[12px] text-muted">Last 30 days · 186 comments</p>
        <p className="font-display text-[19px] font-bold leading-snug">Customers love how fast you reply, but deliveries outside Colombo are too slow.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-[10px] border border-line p-3">
            <p className="flex items-center justify-between text-[13px] font-semibold">
              Fast, friendly replies <span className="rounded-full bg-pos-soft px-2 py-0.5 text-[11px] text-pos-text">64</span>
            </p>
            <p className="mt-2 border-l-2 border-line-strong pl-2 text-[12px] italic text-muted">&ldquo;Nimal sorted it in ten minutes&rdquo;</p>
          </div>
          <div className="rounded-[10px] border border-line p-3">
            <p className="flex items-center justify-between text-[13px] font-semibold">
              Slow delivery upcountry <span className="rounded-full bg-neg-soft px-2 py-0.5 text-[11px] text-neg-text">23</span>
            </p>
            <p className="mt-2 border-l-2 border-line-strong pl-2 text-[12px] italic text-muted">&ldquo;Took 6 days to reach Badulla&rdquo;</p>
          </div>
        </div>
        <p className="text-[12px] font-semibold">Suggested: give Kandy and Badulla orders a courier with next-day delivery.</p>
      </div>
    </AppWindow>
  );
}

export function LeaderboardScreen() {
  const rows = [
    ["Nimal P.", 98, 112],
    ["Amaya K.", 95, 87],
    ["Ruwan S.", 91, 140],
    ["Fathima R.", 88, 64],
  ] as const;
  return (
    <AppWindow title="Leaderboard" label="Team leaderboard: agents ranked by customer satisfaction, from 98% down to 88%.">
      <div className="space-y-3 p-5">
        {rows.map(([name, pct, n], i) => (
          <div key={name} className="flex items-center gap-3">
            <span className="w-5 text-right text-[13px] font-bold text-muted">{i + 1}</span>
            <span className="w-24 truncate text-[13px] font-semibold">{name}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eceef2]">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-10 text-right text-[13px] font-bold tabular">{pct}%</span>
            <span className="hidden w-16 text-right text-[12px] text-muted sm:inline">{n} ratings</span>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

/** TapRate sends the survey: a send's results, with the reminder. */
export function SendScreen() {
  const stats = [
    ["Sent", "412", ""],
    ["Rated", "168", "41% of sent"],
    ["Reminder", "97", "after 3 days"],
    ["Skipped", "23", "emailed recently"],
  ] as const;
  return (
    <AppWindow title="Send by email" label="A survey email sent to 412 customers: 168 rated, a reminder went to 97 people after 3 days, and 23 were skipped because they were emailed recently.">
      <div className="space-y-4 p-5">
        <div className="rounded-[10px] border border-line bg-[#fafbfc] p-3">
          <p className="text-[12px] text-muted">To: 412 customers from orders-october.csv</p>
          <p className="mt-1 text-[13px] font-semibold">How was your delivery, {"{name}"}?</p>
          <div className="mt-2 flex gap-1">
            {["😡", "🙁", "😐", "🙂", "😍"].map((f) => (
              <span key={f} className="flex h-8 w-9 items-center justify-center rounded-[6px] border border-line bg-white text-[16px]">
                {f}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([label, value, sub]) => (
            <div key={label}>
              <p className="text-[12px] text-muted">{label}</p>
              <p className="font-display text-[22px] font-bold leading-tight tabular">{value}</p>
              {sub && <p className="text-[11px] text-muted">{sub}</p>}
            </div>
          ))}
        </div>
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <span className="h-2 w-2 rounded-full bg-pos-fill" aria-hidden /> Unsubscribes and bounced addresses are never emailed again.
        </p>
      </div>
    </AppWindow>
  );
}

/** Branch comparison table, like the dashboard's. */
export function BranchesScreen() {
  const rows = [
    ["Colombo 07", 96, 2.1, 214],
    ["Kandy", 91, -1.4, 132],
    ["Galle Fort", 89, 3.8, 88],
    ["Airport counter", 78, -6.2, 51],
  ] as const;
  return (
    <AppWindow title="Dashboard · By branch" label="Satisfaction by branch: Colombo 07 96%, Kandy 91%, Galle Fort 89%, Airport counter 78% and falling.">
      <div className="space-y-3 p-5">
        {rows.map(([name, pct, diff, n]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="w-28 truncate text-[13px] font-semibold">{name}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eceef2]">
              <span className={`block h-full rounded-full ${pct < 80 ? "bg-neu-fill" : "bg-pos-fill"}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="w-10 text-right text-[13px] font-bold tabular">{pct}%</span>
            <span className={`w-12 text-right text-[12px] font-semibold tabular ${diff > 0 ? "text-pos-text" : "text-neg-text"}`}>
              {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
            </span>
            <span className="hidden w-14 text-right text-[12px] text-muted sm:inline">{n}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-3 rounded-[10px] border border-dashed border-line-strong p-3">
          <Qr text="https://taprate.app/s/kandy" size={56} />
          <p className="text-[12px] text-muted">
            <span className="block font-semibold text-ink">Kandy counter QR</span>
            Each branch gets its own QR code, links and kiosks.
          </p>
        </div>
      </div>
    </AppWindow>
  );
}

/** The same rating buttons in English, Sinhala and Tamil. */
export function LanguagesScreen() {
  const rows = [
    ["English", "How was your visit?", ["Very poor", "Okay", "Excellent"]],
    ["සිංහල", "ඔබේ පැමිණීම කෙසේද?", ["ඉතා දුර්වලයි", "සාමාන්‍යයි", "විශිෂ්ටයි"]],
    ["தமிழ்", "உங்கள் வருகை எப்படி இருந்தது?", ["மிக மோசம்", "பரவாயில்லை", "மிகச் சிறப்பு"]],
  ] as const;
  const faces = ["😡", "😐", "😍"];
  return (
    <div role="img" aria-label="The same rating question and buttons shown in English, Sinhala and Tamil." className="space-y-3">
      {rows.map(([lang, q, labels]) => (
        <div key={lang} aria-hidden className="rounded-[14px] border border-line bg-surface p-4 shadow-[0_20px_40px_-32px_rgba(16,21,61,0.45)]">
          <p className="text-[11px] font-semibold text-muted">{lang}</p>
          <p className="mt-0.5 text-[15px] font-bold">{q}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {labels.map((l, i) => (
              <span key={l} className="flex min-w-[70px] flex-col items-center rounded-[8px] border-2 border-line bg-white px-2 py-1">
                <span className="text-[18px]">{faces[i]}</span>
                <span className="text-[10px] font-bold text-[#374151]">{l}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Testimonial wall on a website, and the office TV screen. */
export function WallScreen() {
  const quotes = [
    ["Nimal sorted it in ten minutes. Brilliant.", "Amaya"],
    ["Fresh, on time and the driver was lovely.", "A customer"],
    ["Best coffee in Kandy, every single time.", "Ruwan"],
  ] as const;
  return (
    <div role="img" aria-label="Happy customers' comments shown on a business's website, and a TV screen in the office showing 94% happy customers today." className="relative pb-10">
      <div aria-hidden className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_30px_60px_-36px_rgba(16,21,61,0.45)]">
        <div className="border-b border-line bg-[#fafbfc] px-4 py-2.5 text-[12px] font-semibold text-muted">kovacafe.lk · What our customers say</div>
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          {quotes.map(([q, who]) => (
            <div key={q} className="rounded-[10px] border border-line p-3">
              <p className="text-[12px] leading-snug">&ldquo;{q}&rdquo;</p>
              <p className="mt-2 text-[11px] font-semibold">
                {who} <span className="text-neu-fill">★★★★★</span>
              </p>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="absolute -bottom-2 right-4 w-[210px] rounded-[12px] border-[5px] border-[#10153d] bg-[#0f1326] p-3 text-white shadow-[0_30px_60px_-30px_rgba(16,21,61,0.6)] sm:right-8">
        <p className="text-[10px] text-[#9aa1c7]">Office TV · happy today</p>
        <p className="font-display text-[34px] font-bold leading-none">
          94<span className="text-[16px] text-[#9aa1c7]">%</span>
        </p>
        <div className="mt-2 flex h-6 items-end gap-[2px]">
          {[1, 1, 0.66, 1, 1, 0.4, 1, 1, 1, 0.66, 1, 1, 1, 1].map((h, i) => (
            <span key={i} className="flex-1 rounded-[1px]" style={{ height: `${h * 100}%`, background: h === 1 ? "#22c55e" : h > 0.5 ? "#f59e0b" : "#ef4444" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The signature band: a long run of ticks, one per customer tap. */
export function StripeBand() {
  const ticks = pattern(160, 23, 11, 6);
  return (
    <div className="relative overflow-hidden" aria-hidden>
      <div className="flex h-28 items-end gap-[3px] px-1">
        {ticks.map((s, i) => (
          <span key={i} className="min-w-[4px] flex-1 rounded-t-[3px]" style={{ height: H[s], background: COLOR[s], opacity: 0.25 + (i / ticks.length) * 0.75 }} />
        ))}
      </div>
    </div>
  );
}
