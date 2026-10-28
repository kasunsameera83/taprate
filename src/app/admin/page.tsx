"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { formatMoney, type Currency } from "@/lib/billing/catalog";
import { LoadError, Skeleton } from "@/components/ui";

type Overview = {
  businesses: number;
  new_30d: number;
  new_7d: number;
  active_30d: number;
  suspended: number;
  paying: number;
  past_due: number;
  responses_30d: number;
  responses_total: number;
  mrr: Partial<Record<Currency, number>>;
  revenue_30d: Partial<Record<Currency, number>>;
  plans: Record<string, number>;
  billing_problems_30d: number;
  signups_by_day: Array<{ day: string; n: number }>;
};

const money = (m: Partial<Record<Currency, number>>) =>
  (Object.entries(m) as Array<[Currency, number]>).map(([c, v]) => formatMoney(Number(v), c)).join(" + ") || "—";

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "neg" }) {
  return (
    <div className="panel p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular ${tone === "neg" ? "text-neg-text" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-[13px] text-muted">{note}</p>}
    </div>
  );
}

export default function AdminOverview() {
  const [d, setD] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Overview>("/api/admin/overview").then((r) => (r.ok ? setD(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!d) return <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />;

  const max = Math.max(1, ...d.signups_by_day.map((s) => Number(s.n)));
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, n: Number(d.signups_by_day.find((s) => s.day === date)?.n ?? 0) };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-tight">Overview</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Monthly recurring revenue" value={money(d.mrr)} note={`${d.paying} paying businesses`} />
        <Stat label="Revenue, last 30 days" value={money(d.revenue_30d)} />
        <Stat label="Businesses" value={d.businesses.toLocaleString()} note={`+${d.new_7d} this week, +${d.new_30d} in 30 days`} />
        <Stat label="Active businesses (30 days)" value={d.active_30d.toLocaleString()} note="collected at least one rating" />
        <Stat label="Ratings, last 30 days" value={d.responses_30d.toLocaleString()} note={`${d.responses_total.toLocaleString()} all time`} />
        <Stat label="Payments failing" value={String(d.past_due)} tone={d.past_due ? "neg" : undefined} note="subscriptions past due" />
        <Stat label="Rejected payment notices" value={String(d.billing_problems_30d)} tone={d.billing_problems_30d ? "neg" : undefined} note="last 30 days (check the logs)" />
        <Stat label="Suspended" value={String(d.suspended)} />
      </div>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">Sign-ups, last 30 days</h2>
        <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label={`Sign-ups per day for the last 30 days, ${d.new_30d} in total`}>
          {days.map((x) => (
            <div key={x.date} title={`${x.date}: ${x.n}`} className="flex-1 rounded-t bg-brand" style={{ height: `${Math.max(2, (x.n / max) * 100)}%`, opacity: x.n ? 1 : 0.15 }} />
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">Businesses by plan</h2>
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {Object.entries(d.plans).map(([plan, n]) => (
            <li key={plan} className="rounded-[10px] border border-line px-3 py-2">
              <span className="capitalize text-muted">{plan}</span> <strong className="tabular">{n}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
