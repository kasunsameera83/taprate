"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, qs } from "@/lib/client/api";
import type { BranchStat, Location, ResponseItem, ResponsesPage, StatsResponse, Survey } from "@/lib/client/types";
import { isIconSetId, ratingOption } from "@/lib/surveys/iconSets";
import { FeedbackStripe } from "@/components/FeedbackStripe";
import { LoadError, Segmented, SentimentDot, Skeleton, Notice } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { Checklist } from "./Checklist";
import { sampleStats } from "@/lib/onboarding/sample";
import { PageLoader } from "@/components/FaceLoader";
import { useOnResponsesChanged } from "@/components/Notifications";

type Days = 7 | 30 | 90;
const PERIODS: ReadonlyArray<{ value: Days; label: string }> = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export default function Dashboard() {
  const [days, setDays] = useState<Days>(30);
  const [surveyId, setSurveyId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [followUps, setFollowUps] = useState<ResponseItem[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  // Sample data preview for new accounts (never saved; clearly labelled).
  const [sample, setSample] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    api<Survey[]>("/api/surveys").then((r) => setSurveys(r.ok ? r.data : []));
    api<Location[]>("/api/locations").then((r) => r.ok && setLocations(r.data));
    api<{ account: { id: string } | null }>("/api/account").then((r) => r.ok && setAccountId(r.data.account?.id ?? null));
  }, []);

  const load = useCallback(() => setReload((n) => n + 1), []);
  // New ratings arrived: refresh the numbers quietly (no loading face).
  const quiet = useRef(false);
  useOnResponsesChanged(() => {
    quiet.current = true;
    load();
  });

  useEffect(() => {
    let live = true;
    if (!quiet.current) setStats(null);
    quiet.current = false;
    setError("");
    const filter = { surveyId: surveyId || undefined, locationId: locationId || undefined };
    Promise.all([
      api<StatsResponse>(`/api/stats${qs({ days, ...filter })}`),
      api<ResponsesPage>(`/api/responses${qs({ ...filter, sentiment: "negative", limit: 5 })}`),
    ]).then(([s, f]) => {
      if (!live) return;
      if (s.ok) setStats(s.data);
      else setError(s.message);
      setFollowUps(f.ok ? f.data.items : []);
    });
    return () => {
      live = false;
    };
  }, [days, surveyId, locationId, reload]);

  const noSurveys = surveys !== null && surveys.length === 0;
  const shown: StatsResponse | null = sample ? (sampleStats(days) as StatsResponse) : stats;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Dashboard</h1>
          <p className="text-sm text-muted">How customers rated you in the last {days} days.</p>
        </div>
        {!noSurveys && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="survey-filter">
              Survey
            </label>
            <select id="survey-filter" className="input w-auto min-w-44" value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
              <option value="">All surveys</option>
              {surveys?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {locations.length > 0 && (
              <>
                <label className="sr-only" htmlFor="location-filter">
                  Branch
                </label>
                <select id="location-filter" className="input w-auto min-w-40" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">All branches</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.archived ? " (archived)" : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            <Segmented label="Period" value={days} options={PERIODS} onChange={setDays} />
          </div>
        )}
      </header>

      {error && <LoadError message={error} onRetry={load} />}

      <Checklist accountId={accountId} />

      {sample && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-neu-fill bg-neu-soft px-4 py-3 text-sm text-neu-text">
          <span>
            <strong>Sample data.</strong> These aren&rsquo;t real ratings: it&rsquo;s a preview of what your dashboard will look like.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSample(false)}>
            Back to my data
          </button>
        </div>
      )}

      {noSurveys && !sample ? (
        <GettingStarted onSample={() => setSample(true)} />
      ) : (
        <>
          {stats?.account && stats.account.credits <= 10 && (
            <Notice kind="error">
              Only {stats.account.credits} responses left. When they run out, your buttons show &ldquo;survey closed&rdquo; and new ratings are not saved.
            </Notice>
          )}
          {!sample && stats && stats.total === 0 && (
            <p className="text-sm text-muted">
              No ratings yet.{" "}
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setSample(true)}>
                Preview the dashboard with sample data
              </button>
            </p>
          )}
          <Hero stats={shown} days={days} />
          <KpiRow stats={shown} days={days} />
          <DailyChart stats={shown} />
          <Reasons stats={shown} />
          <div className="grid gap-6 lg:grid-cols-5">
            <FollowUps items={sample ? [] : followUps} surveyId={surveyId} />
            <Agents stats={shown} />
          </div>
          {!locationId && shown && shown.byLocation.length > 0 && <Branches rows={shown.byLocation} days={days} onPick={sample ? () => undefined : setLocationId} />}
        </>
      )}
    </div>
  );
}

/* ---------- Pieces ---------- */

function Delta({ current, previous, unit, days }: { current: number | null; previous: number | null; unit: "pts" | "count"; days: number }) {
  if (current === null || previous === null) {
    return <span className="text-[13px] text-muted">No earlier data to compare</span>;
  }
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return <span className="text-[13px] text-muted">No change vs previous {days} days</span>;
  const up = diff > 0;
  // For satisfaction and volume, up is good.
  return (
    <span className={`text-[13px] font-semibold ${up ? "text-pos-text" : "text-neg-text"}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span> {Math.abs(diff)}
      {unit === "pts" ? " pts" : ""} <span className="font-normal text-muted">vs previous {days} days</span>
    </span>
  );
}

function Hero({ stats, days }: { stats: StatsResponse | null; days: number }) {
  if (!stats) {
    return (
      <section className="rounded-[var(--radius-hero)] border border-line bg-surface p-6 sm:p-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-16 w-40" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-24 w-full self-end" />
        </div>
      </section>
    );
  }
  const hasData = stats.total > 0;
  return (
    <section aria-labelledby="sat-title" className="rounded-[var(--radius-hero)] border border-line bg-surface p-6 sm:p-8">
      <div className="grid items-end gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <h2 id="sat-title" className="font-sans text-sm font-semibold tracking-normal text-muted">
            Customer satisfaction
          </h2>
          {hasData ? (
            <>
              <p className="font-display tabular mt-1 text-[64px] font-bold leading-none tracking-tight">
                {stats.satisfactionPct}
                <span className="text-[36px] text-muted">%</span>
              </p>
              <div className="mt-3">
                <Delta current={stats.satisfactionPct} previous={stats.previous.satisfactionPct} unit="pts" days={days} />
              </div>
              <p className="mt-1 text-[13px] text-muted">
                {stats.positive} of {stats.total} ratings were positive.
              </p>
            </>
          ) : (
            <>
              <p className="font-display mt-1 text-[40px] font-bold leading-none text-faint">No ratings yet</p>
              <p className="mt-3 text-sm text-muted">
                Nothing in the last {days} days. Ratings appear here as soon as a customer clicks a button in your email.
              </p>
            </>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-sans text-sm font-semibold tracking-normal text-muted">
              Latest ratings
            </h3>
            <ul className="flex gap-3 text-[13px] text-muted" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <SentimentDot sentiment="positive" /> {stats.positive}
              </li>
              <li className="flex items-center gap-1.5">
                <SentimentDot sentiment="neutral" /> {stats.neutral}
              </li>
              <li className="flex items-center gap-1.5">
                <SentimentDot sentiment="negative" /> {stats.negative}
              </li>
            </ul>
          </div>
          <FeedbackStripe items={stats.recent} slots={60} height={72} />
          <p className="mt-2 text-[13px] text-muted">Each bar is one rating, newest on the right.</p>
        </div>
      </div>
    </section>
  );
}

function KpiRow({ stats, days }: { stats: StatsResponse | null; days: number }) {
  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel space-y-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="panel p-5">
        <h2 className="font-sans text-sm font-semibold tracking-normal text-muted">
          Ratings
        </h2>
        <p className="font-display tabular mt-1 text-[32px] font-bold leading-tight">{stats.total}</p>
        <Delta current={stats.total} previous={stats.previous.total} unit="count" days={days} />
      </div>
      <div className="panel p-5">
        <h2 className="font-sans text-sm font-semibold tracking-normal text-muted">
          {stats.nps ? "Net Promoter Score" : stats.ces ? "Customer effort" : "Net Promoter Score"}
        </h2>
        {!stats.nps && stats.ces ? (
          <>
            <p className="font-display tabular mt-1 text-[32px] font-bold leading-tight">
              {stats.ces.average}
              <span className="text-lg text-muted"> / 7</span>
            </p>
            <p className="text-[13px] text-muted">Average of {stats.ces.total} effort ratings. Higher is easier.</p>
          </>
        ) : stats.nps ? (
          <>
            <p className="font-display tabular mt-1 text-[32px] font-bold leading-tight">{stats.nps.score}</p>
            <p className="text-[13px] text-muted">
              {stats.nps.promoters} promoters, {stats.nps.detractors} detractors
            </p>
          </>
        ) : (
          <>
            <p className="font-display mt-1 text-[32px] font-bold leading-tight text-faint">None yet</p>
            <p className="text-[13px] text-muted">Shown when a survey uses the 0–10 or effort scale.</p>
          </>
        )}
      </div>
      <div className="panel p-5">
        <h2 className="font-sans text-sm font-semibold tracking-normal text-muted">
          Won back
        </h2>
        {stats.recovery.answered > 0 ? (
          <>
            <p className="font-display tabular mt-1 text-[32px] font-bold leading-tight">
              {stats.recovery.ratePct}
              <span className="text-lg text-muted">%</span>
            </p>
            <p className="text-[13px] text-muted">
              {stats.recovery.recovered} of {stats.recovery.answered} unhappy customers were happy when asked again after their follow-up.
            </p>
          </>
        ) : (
          <>
            <p className="font-display mt-1 text-[32px] font-bold leading-tight text-faint">{stats.recovery.sent > 0 ? "Waiting" : "None yet"}</p>
            <p className="text-[13px] text-muted">
              {stats.recovery.sent > 0
                ? `${stats.recovery.sent} “Did we put it right?” emails sent. Answers show here.`
                : "Resolve a follow-up and the customer is asked how they feel now."}
            </p>
          </>
        )}
      </div>
      <div className="panel p-5">
        <h2 className="font-sans text-sm font-semibold tracking-normal text-muted">
          Awaiting confirmation
        </h2>
        <p className="font-display tabular mt-1 text-[32px] font-bold leading-tight">{stats.pending}</p>
        <p className="text-[13px] text-muted">
          Clicks not yet confirmed by a real browser. Email scanners end up here and are never counted.
        </p>
      </div>
    </div>
  );
}

function DailyChart({ stats }: { stats: StatsResponse | null }) {
  if (!stats) return <PageLoader className="h-64" />;
  const max = Math.max(1, ...stats.byDay.map((d) => d.total));
  const mid = stats.byDay[Math.floor(stats.byDay.length / 2)];
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="daily-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="daily-title" className="text-lg font-semibold">
          Ratings per day
        </h2>
        <ul className="flex gap-4 text-[13px] text-muted" aria-hidden>
          <li className="flex items-center gap-1.5">
            <SentimentDot sentiment="positive" /> Positive
          </li>
          <li className="flex items-center gap-1.5">
            <SentimentDot sentiment="neutral" /> Neutral
          </li>
          <li className="flex items-center gap-1.5">
            <SentimentDot sentiment="negative" /> Negative
          </li>
        </ul>
      </div>
      <div className="flex h-44 items-end gap-[2px] border-b border-line" aria-hidden>
        {stats.byDay.map((d) => (
          <div
            key={d.date}
            title={`${fmt(d.date)}: ${d.total} ratings (${d.positive} positive, ${d.neutral} neutral, ${d.negative} negative)`}
            className="flex min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-t-[3px]"
            style={{ height: `${(d.total / max) * 100}%` }}
          >
            <div className="bg-pos-fill" style={{ flexGrow: d.positive }} />
            <div className="bg-neu-fill" style={{ flexGrow: d.neutral }} />
            <div className="bg-neg-fill" style={{ flexGrow: d.negative }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-muted" aria-hidden>
        <span>{stats.byDay[0] && fmt(stats.byDay[0].date)}</span>
        <span>{mid && fmt(mid.date)}</span>
        <span>Today</span>
      </div>
      {/* Screen-reader version of the chart */}
      <table className="sr-only">
        <caption>Ratings per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Total</th>
            <th>Positive</th>
            <th>Neutral</th>
            <th>Negative</th>
          </tr>
        </thead>
        <tbody>
          {stats.byDay
            .filter((d) => d.total > 0)
            .map((d) => (
              <tr key={d.date}>
                <td>{fmt(d.date)}</td>
                <td>{d.total}</td>
                <td>{d.positive}</td>
                <td>{d.neutral}</td>
                <td>{d.negative}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

function Reasons({ stats }: { stats: StatsResponse | null }) {
  if (!stats || (stats.drivers.positive.length === 0 && stats.drivers.negative.length === 0)) return null;
  const col = (title: string, items: Array<{ label: string; count: number }>, tone: "pos" | "neg") => {
    const max = Math.max(1, ...items.map((i) => i.count));
    return (
      <div>
        <h3 className="font-sans text-sm font-semibold tracking-normal text-muted">{title}</h3>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((i) => (
              <li key={i.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{i.label}</span>
                  <span className="tabular shrink-0 font-semibold">{i.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f1f5f9]" aria-hidden>
                  <div className={`h-full rounded-full ${tone === "pos" ? "bg-pos-fill" : "bg-neg-fill"}`} style={{ width: `${(i.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };
  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="reasons-title">
      <h2 id="reasons-title" className="mb-4 text-lg font-semibold">
        Why customers rated you this way
      </h2>
      <div className="grid gap-6 md:grid-cols-2">
        {col("What went well", stats.drivers.positive, "pos")}
        {col("What could be better", stats.drivers.negative, "neg")}
      </div>
    </section>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FollowUps({ items, surveyId }: { items: ResponseItem[] | null; surveyId: string }) {
  return (
    <section className="panel p-5 sm:p-6 lg:col-span-3" aria-labelledby="follow-title">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="follow-title" className="text-lg font-semibold">
          Needs follow-up
        </h2>
        <Link href="/app/follow-ups" className="link text-sm">
          Open follow-ups
        </Link>
      </div>
      {items === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-sm text-muted">No unhappy customers right now. Negative ratings show up here so you can call them back.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((r) => {
            const opt = r.iconSet && isIconSetId(r.iconSet) && r.rating !== null ? ratingOption(r.iconSet, r.rating) : undefined;
            return (
              <li key={r.id} className="flex gap-3 py-3">
                <span className="mt-0.5 text-xl leading-none" aria-hidden>
                  {opt?.symbol}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{r.email ?? "Unknown customer"}</span>
                    <span className="text-muted"> rated {opt?.label ?? r.rating}</span>
                    {r.agent && <span className="text-muted"> for {r.agent}</span>}
                  </p>
                  {r.comment && <p className="mt-0.5 line-clamp-2 break-words text-sm text-ink">&ldquo;{r.comment}&rdquo;</p>}
                  <p className="mt-0.5 text-[12px] text-muted">
                    {r.surveyName}
                    {r.ticket ? `, ticket ${r.ticket}` : ""}, {timeAgo(r.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Agents({ stats }: { stats: StatsResponse | null }) {
  return (
    <section className="panel p-5 sm:p-6 lg:col-span-2" aria-labelledby="agents-title">
      <h2 id="agents-title" className="mb-3 text-lg font-semibold">
        By agent
      </h2>
      {!stats ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : stats.byAgent.length === 0 ? (
        <p className="py-6 text-sm text-muted">
          Agent names come from helpdesk buttons (Zendesk, Freshdesk, HubSpot). Signature buttons don&rsquo;t include them.
        </p>
      ) : (
        <ul className="space-y-3">
          {stats.byAgent.map((a) => (
            <li key={a.agent}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{a.agent}</span>
                <span className="tabular shrink-0 text-muted">
                  <span className="font-semibold text-ink">{a.satisfactionPct}%</span> of {a.total}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#f1f5f9]" aria-hidden>
                <div className="h-full rounded-full bg-pos-fill" style={{ width: `${a.satisfactionPct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Branch comparison: satisfaction per branch, change on the previous period, and unhappy ratings. */
function Branches({ rows, days, onPick }: { rows: BranchStat[]; days: number; onPick: (id: string) => void }) {
  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="branches-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="branches-title" className="text-lg font-semibold">
          By branch
        </h2>
        <p className="text-[13px] text-muted">Last {days} days. Choose a branch to see only its ratings.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-[13px] text-muted">
            <tr>
              <th scope="col" className="pb-2 font-semibold">Branch</th>
              <th scope="col" className="pb-2 font-semibold">Satisfaction</th>
              <th scope="col" className="pb-2 text-right font-semibold">Change</th>
              <th scope="col" className="pb-2 text-right font-semibold">Ratings</th>
              <th scope="col" className="pb-2 text-right font-semibold">Unhappy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((b) => {
              const diff = b.satisfactionPct !== null && b.previousPct !== null ? Math.round((b.satisfactionPct - b.previousPct) * 10) / 10 : null;
              return (
                <tr key={b.id}>
                  <td className="py-2.5 pr-3">
                    <button type="button" className="text-left font-semibold hover:text-brand hover:underline" onClick={() => onPick(b.id)}>
                      {b.name}
                    </button>
                  </td>
                  <td className="w-[40%] py-2.5 pr-3">
                    {b.satisfactionPct === null ? (
                      <span className="text-muted">No ratings</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1f5f9]" aria-hidden>
                          <span className="block h-full rounded-full bg-pos-fill" style={{ width: `${b.satisfactionPct}%` }} />
                        </span>
                        <span className="tabular w-12 text-right font-semibold">{b.satisfactionPct}%</span>
                      </span>
                    )}
                  </td>
                  <td className={`tabular py-2.5 text-right ${diff === null || diff === 0 ? "text-muted" : diff > 0 ? "font-semibold text-pos-text" : "font-semibold text-neg-text"}`}>
                    {diff === null ? "–" : diff === 0 ? "0" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}`}
                    {diff !== null && diff !== 0 && <span className="sr-only"> points</span>}
                  </td>
                  <td className="tabular py-2.5 text-right">{b.total}</td>
                  <td className={`tabular py-2.5 text-right ${b.negative ? "font-semibold text-neg-text" : "text-muted"}`}>{b.negative}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GettingStarted({ onSample }: { onSample: () => void }) {
  const steps = [
    { title: "Create a survey", body: "Write your question and pick a rating scale: faces, stars, thumbs or 0–10." },
    { title: "Add the buttons to your emails", body: "Copy them into your Gmail or Outlook signature, or a helpdesk template." },
    { title: "Watch ratings arrive", body: "Every click shows up here with the customer, the agent and any comment." },
  ];
  return (
    <section className="rounded-[var(--radius-hero)] border border-line bg-surface p-6 sm:p-10">
      <h2 className="text-2xl font-bold">Get your first rating in three steps</h2>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
              {i + 1}
            </span>
            <div>
              <h3 className="font-sans font-semibold tracking-normal">
                {s.title}
              </h3>
              <p className="mt-0.5 text-sm text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap gap-2">
        <Link href="/app/surveys/new" className="btn btn-primary">
          <IconPlus className="h-4 w-4" />
          Create your first survey
        </Link>
        <button type="button" className="btn btn-secondary" onClick={onSample}>
          Preview with sample data
        </button>
      </div>
    </section>
  );
}
