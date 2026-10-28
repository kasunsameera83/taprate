"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Sentiment } from "@/lib/surveys/iconSets";

type TvData = {
  business: string;
  screen: string;
  week: { total: number; pct: number | null };
  today: { total: number; pct: number | null; negative: number };
  recent: Array<{ sentiment: Sentiment }>;
  byLocation: Array<{ name: string; total: number; pct: number | null }>;
  openFollowups: number;
  kudos: Array<{ text: string; at: string }>;
  updatedAt: string;
};

const REFRESH_MS = 60_000;
const ROTATE_MS = 12_000;
const FILL: Record<Sentiment, string> = { positive: "#22c55e", neutral: "#f59e0b", negative: "#ef4444" };
const H: Record<Sentiment, string> = { positive: "100%", neutral: "66%", negative: "40%" };

// Designed to be read from across a room: very large numbers, high contrast on a dark background,
// updates every minute. Kind words rotate slowly (static with reduced motion).
export function TvClient({ token }: { token: string }) {
  const [data, setData] = useState<TvData | null>(null);
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [reduced, setReduced] = useState(false);

  const load = useCallback(() => {
    api<TvData>("/api/public/tv", { method: "POST", body: { token } }).then((r) => {
      if (r.ok) {
        setData(r.data);
        setError("");
      } else setError(r.status === 404 ? r.message : "Reconnecting…");
    });
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (reduced || !data?.kudos.length) return;
    const t = setInterval(() => setI((n) => n + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [reduced, data?.kudos.length]);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f1326] p-10 text-2xl text-[#c7d2fe]">
        {error || "Loading…"}
      </main>
    );
  }
  const kudo = data.kudos.length ? data.kudos[i % data.kudos.length] : null;
  const slots = 60;
  const ticks = [...data.recent].reverse();

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-[#0f1326] p-8 text-white lg:p-12">
      <header className="flex items-baseline justify-between gap-6">
        <h1 className="font-display text-3xl font-bold lg:text-4xl">{data.business}</h1>
        <p className="text-lg text-[#9aa1c7]">
          {data.screen} · updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {error && <span className="ml-3 text-[#fbbf24]">{error}</span>}
        </p>
      </header>

      <section className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col justify-between gap-10 rounded-[28px] bg-[#171c36] p-8 lg:p-10">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xl text-[#9aa1c7]">Happy customers today</p>
              <p className="font-display tabular text-[120px] font-bold leading-none lg:text-[160px]">
                {data.today.pct ?? "–"}
                {data.today.pct !== null && <span className="text-[56px] text-[#9aa1c7]">%</span>}
              </p>
              <p className="mt-2 text-xl text-[#c7d2fe]">{data.today.total} ratings today</p>
            </div>
            <div>
              <p className="text-xl text-[#9aa1c7]">Last 7 days</p>
              <p className="font-display tabular text-[120px] font-bold leading-none text-[#c7d2fe] lg:text-[160px]">
                {data.week.pct ?? "–"}
                {data.week.pct !== null && <span className="text-[56px] text-[#9aa1c7]">%</span>}
              </p>
              <p className="mt-2 text-xl text-[#c7d2fe]">{data.week.total} ratings</p>
            </div>
          </div>
          <div>
            <div className="flex h-28 items-end gap-[4px]" aria-hidden>
              {Array.from({ length: Math.max(0, slots - ticks.length) }, (_, k) => (
                <span key={`e${k}`} className="h-[14%] flex-1 rounded-[3px] bg-[#262c4d]" />
              ))}
              {ticks.slice(-slots).map((t, k) => (
                <span key={k} className="flex-1 rounded-[3px]" style={{ height: H[t.sentiment], background: FILL[t.sentiment] }} />
              ))}
            </div>
            <p className="mt-3 text-lg text-[#9aa1c7]">Latest {Math.min(slots, ticks.length)} ratings, newest on the right</p>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-8">
            <div className="rounded-[28px] bg-[#171c36] p-8">
              <p className="text-xl text-[#9aa1c7]">Unhappy today</p>
              <p className={`font-display tabular text-7xl font-bold ${data.today.negative ? "text-[#f87171]" : ""}`}>{data.today.negative}</p>
            </div>
            <div className="rounded-[28px] bg-[#171c36] p-8">
              <p className="text-xl text-[#9aa1c7]">Open follow-ups</p>
              <p className={`font-display tabular text-7xl font-bold ${data.openFollowups ? "text-[#fbbf24]" : ""}`}>{data.openFollowups}</p>
            </div>
          </div>

          {kudo ? (
            <figure className="flex flex-1 flex-col justify-center rounded-[28px] bg-[#1f2a5c] p-8 lg:p-10" aria-live="polite">
              <p className="text-xl text-[#a5b4fc]">What customers said</p>
              <blockquote key={i} className="mt-4 text-3xl font-semibold leading-snug motion-safe:animate-[kt-fade_0.8s_ease-out_both] lg:text-4xl">
                &ldquo;{kudo.text}&rdquo;
              </blockquote>
            </figure>
          ) : data.byLocation.length > 0 ? null : (
            <div className="flex flex-1 items-center justify-center rounded-[28px] border-2 border-dashed border-[#262c4d] p-8 text-xl text-[#9aa1c7]">
              Every tap shows up here within a minute.
            </div>
          )}

          {data.byLocation.length > 0 && (
            <div className="rounded-[28px] bg-[#171c36] p-8">
              <p className="mb-4 text-xl text-[#9aa1c7]">By branch, last 7 days</p>
              <ul className="space-y-3">
                {data.byLocation.map((b) => (
                  <li key={b.name} className="flex items-center gap-4 text-2xl">
                    <span className="w-48 truncate font-semibold">{b.name}</span>
                    <span className="h-4 flex-1 overflow-hidden rounded-full bg-[#262c4d]">
                      <span className="block h-full rounded-full bg-[#22c55e]" style={{ width: `${b.pct ?? 0}%` }} />
                    </span>
                    <span className="tabular w-20 text-right font-bold">{b.pct ?? "–"}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
