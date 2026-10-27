"use client";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { EmptyState, LoadError, Segmented, Skeleton } from "@/components/ui";
import { IconTrophy } from "@/components/icons";

type Row = { agent: string; total: number; satisfactionPct: number; negative: number; previousSatisfactionPct: number | null };
type Board = { ranked: Row[]; tooFew: Row[]; minRatings: number; truncated: boolean };
type Days = 7 | 30 | 90;

export default function LeaderboardPage() {
  const [days, setDays] = useState<Days>(30);
  const [surveyId, setSurveyId] = useState("");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<Survey[]>("/api/surveys").then((r) => r.ok && setSurveys(r.data));
  }, []);

  useEffect(() => {
    let live = true;
    setBoard(null);
    setError("");
    api<Board>(`/api/leaderboard${qs({ days, surveyId: surveyId || undefined })}`).then((r) => {
      if (!live) return;
      if (r.ok) setBoard(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [days, surveyId, reload]);

  const retry = useCallback(() => setReload((n) => n + 1), []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Leaderboard</h1>
          <p className="text-sm text-muted">Agents ranked by the share of happy customers. Use it to thank people, not to blame them.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="lb-survey">
            Survey
          </label>
          <select id="lb-survey" className="input w-auto min-w-44" value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
            <option value="">All surveys</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Segmented
            label="Period"
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: "7 days" },
              { value: 30, label: "30 days" },
              { value: 90, label: "90 days" },
            ]}
          />
        </div>
      </header>

      {error && <LoadError message={error} onRetry={retry} />}

      {!board && !error ? (
        <Skeleton className="h-80 w-full rounded-[var(--radius-panel)]" />
      ) : board && board.ranked.length === 0 && board.tooFew.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<IconTrophy className="h-8 w-8" />}
            title="No agent ratings yet"
            body="Agent names come from helpdesk buttons (Zendesk, Freshdesk, HubSpot) or the agent tag in custom buttons."
          />
        </div>
      ) : board ? (
        <>
          {board.ranked.length > 0 && (
            <section className="panel overflow-hidden" aria-label="Ranking">
              <ol className="divide-y divide-line">
                {board.ranked.map((r, i) => (
                  <li key={r.agent} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                    <span
                      className={`font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        i === 0 ? "bg-brand text-white" : "bg-canvas text-muted"
                      }`}
                    >
                      <span className="sr-only">Rank </span>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold">{r.agent}</span>
                        <span className="font-display tabular shrink-0 text-xl font-bold">{r.satisfactionPct}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#eceef2]" aria-hidden>
                        <div className="h-full rounded-full bg-pos-fill" style={{ width: `${r.satisfactionPct}%` }} />
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {r.total} ratings, {r.negative} negative
                        {r.previousSatisfactionPct !== null && (
                          <>
                            {" "}
                            <Trend now={r.satisfactionPct} before={r.previousSatisfactionPct} days={days} />
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {board.tooFew.length > 0 && (
            <section className="panel p-5" aria-labelledby="few-title">
              <h2 id="few-title" className="text-base font-semibold">
                Not enough ratings yet
              </h2>
              <p className="text-sm text-muted">Agents need at least {board.minRatings} ratings in this period to be ranked.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {board.tooFew.map((r) => (
                  <li key={r.agent} className="rounded-full bg-canvas px-3 py-1 text-sm">
                    {r.agent} <span className="text-muted">({r.total})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function Trend({ now, before, days }: { now: number; before: number; days: number }) {
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return <span>(no change vs previous {days} days)</span>;
  return (
    <span className={diff > 0 ? "font-semibold text-pos-text" : "font-semibold text-neg-text"}>
      <span aria-hidden>{diff > 0 ? "▲" : "▼"}</span> {Math.abs(diff)} pts vs previous {days} days
    </span>
  );
}
