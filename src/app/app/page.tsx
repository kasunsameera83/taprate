"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import type { StatsResponse, Survey } from "@/lib/client/types";
import { FormMessage, Stat } from "@/components/ui";

export default function Dashboard() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [surveyId, setSurveyId] = useState("");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Survey[]>("/api/surveys").then((r) => r.ok && setSurveys(r.data));
  }, []);

  useEffect(() => {
    let live = true;
    api<StatsResponse>(`/api/stats${qs({ days, surveyId: surveyId || undefined })}`).then((r) => {
      if (!live) return;
      if (r.ok) {
        setStats(r.data);
        setError("");
      } else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [days, surveyId]);

  const maxDay = Math.max(1, ...(stats?.byDay.map((d) => d.total) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {stats?.account && (
            <p className="text-sm text-[var(--muted)]">
              {stats.account.name} · {stats.account.credits} responses left on your {stats.account.plan} plan
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <select className="input w-auto" value={surveyId} onChange={(e) => setSurveyId(e.target.value)} aria-label="Survey">
            <option value="">All surveys</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)} aria-label="Period">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      <FormMessage kind="error">{error}</FormMessage>

      {stats && stats.total === 0 && surveys.length === 0 && (
        <div className="panel p-6">
          <h2 className="font-semibold">Create your first survey</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Pick a rating scale, copy the buttons into your email signature, and ratings will show up here.</p>
          <Link href="/app/surveys/new" className="btn btn-primary mt-4">
            New survey
          </Link>
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Satisfaction" value={stats.satisfactionPct === null ? "—" : `${stats.satisfactionPct}%`} sub={`${stats.positive} of ${stats.total} positive`} />
            <Stat label="Responses" value={stats.total} sub={stats.pending ? `${stats.pending} awaiting confirmation` : "confirmed clicks"} />
            <Stat label="NPS" value={stats.nps ? stats.nps.score : "—"} sub={stats.nps ? `${stats.nps.total} NPS ratings` : "No NPS surveys yet"} />
            <Stat label="Credits left" value={stats.account?.credits ?? "—"} />
          </div>

          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Responses per day</h2>
            <div className="flex h-36 items-end gap-[2px]" role="img" aria-label="Responses per day chart">
              {stats.byDay.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.total} responses, ${d.satisfactionPct}% satisfied`}
                  className="flex-1 rounded-t bg-[var(--accent)]"
                  style={{ height: `${(d.total / maxDay) * 100}%`, minHeight: d.total ? 2 : 0, opacity: d.total ? 0.35 + (d.satisfactionPct / 100) * 0.65 : 1 }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-[var(--muted)]">
              <span>{stats.byDay[0]?.date}</span>
              <span>{stats.byDay.at(-1)?.date}</span>
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">By agent</h2>
            {stats.byAgent.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No agent names yet. Helpdesk snippets fill these in automatically.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-[var(--muted)]">
                  <tr>
                    <th className="py-1 font-medium">Agent</th>
                    <th className="py-1 font-medium">Responses</th>
                    <th className="py-1 font-medium">Satisfaction</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byAgent.map((a) => (
                    <tr key={a.agent} className="border-t border-[var(--line)]">
                      <td className="py-1.5">{a.agent}</td>
                      <td className="py-1.5">{a.total}</td>
                      <td className="py-1.5">{a.satisfactionPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
