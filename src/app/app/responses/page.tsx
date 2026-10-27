"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, qs } from "@/lib/client/api";
import type { ResponseItem, ResponsesPage, Survey } from "@/lib/client/types";
import { ratingOption, isIconSetId, type Sentiment } from "@/lib/surveys/iconSets";
import { responsesQuerySchema, fieldErrors } from "@/lib/validation/schemas";
import { EmptyState, LoadError, Notice, Segmented, SentimentDot, Skeleton } from "@/components/ui";
import { IconDownload, IconResponses } from "@/components/icons";

type SentimentFilter = "" | Sentiment;
type Filters = {
  surveyId: string;
  status: "confirmed" | "pending";
  sentiment: SentimentFilter;
  hasComment: boolean;
  from: string;
  to: string;
  agent: string;
  channel: string;
  page: number;
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  qr: "QR code",
  whatsapp: "WhatsApp",
  sms: "SMS",
  link: "Link",
  web: "Website",
  kiosk: "Kiosk",
};

const SENTIMENT_OPTIONS: ReadonlyArray<{ value: SentimentFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
];

const PAGE_SIZE = 25;

function fromParams(sp: URLSearchParams): Filters {
  const s = sp.get("sentiment");
  return {
    surveyId: sp.get("surveyId") ?? "",
    status: sp.get("status") === "pending" ? "pending" : "confirmed",
    sentiment: s === "positive" || s === "neutral" || s === "negative" ? s : "",
    hasComment: sp.get("hasComment") === "yes",
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    agent: sp.get("agent") ?? "",
    channel: CHANNEL_LABEL[sp.get("channel") ?? ""] ? (sp.get("channel") as string) : "",
    page: 1,
  };
}

function ResponsesView() {
  const search = useSearchParams();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [filters, setFilters] = useState<Filters>(() => fromParams(search));
  const [data, setData] = useState<ResponsesPage | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [canExport, setCanExport] = useState(false);

  useEffect(() => {
    api<Survey[]>("/api/surveys").then((r) => r.ok && setSurveys(r.data));
    api<{ role: string | null }>("/api/account").then((r) => r.ok && setCanExport(r.data.role === "owner" || r.data.role === "admin"));
  }, []);

  const query = {
    surveyId: filters.surveyId || undefined,
    status: filters.status,
    sentiment: filters.status === "confirmed" ? filters.sentiment || undefined : undefined,
    hasComment: filters.hasComment ? ("yes" as const) : undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    agent: filters.agent.trim() || undefined,
    channel: filters.channel || undefined,
    page: filters.page,
    limit: PAGE_SIZE,
  };
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    // Same schema the server uses: catch bad filters (e.g. dates in the wrong order) before sending.
    const check = responsesQuerySchema.safeParse(query);
    if (!check.success) {
      setError(Object.values(fieldErrors(check.error))[0] ?? "Check the filters.");
      return;
    }
    // Keep the URL shareable: the current filters, without the page number.
    window.history.replaceState(
      null,
      "",
      `/app/responses${qs({
        surveyId: query.surveyId,
        status: query.status === "pending" ? "pending" : undefined,
        sentiment: query.sentiment,
        hasComment: query.hasComment,
        from: query.from,
        to: query.to,
        agent: query.agent,
        channel: query.channel,
      })}`,
    );

    let live = true;
    setData(null);
    const t = setTimeout(() => {
      api<ResponsesPage>(`/api/responses${qs(query)}`).then((r) => {
        if (!live) return;
        if (r.ok) {
          setData(r.data);
          setError("");
        } else setError(r.message);
      });
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [queryKey, reload]);

  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const filtersApplied = Boolean(filters.surveyId || filters.sentiment || filters.hasComment || filters.from || filters.to || filters.agent || filters.channel);
  const clear = () => update({ surveyId: "", sentiment: "", hasComment: false, from: "", to: "", agent: "", channel: "" });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const exportHref = `/api/responses/export${qs({ surveyId: filters.surveyId || undefined, from: filters.from || undefined, to: filters.to || undefined })}`;
  const load = useCallback(() => setReload((n) => n + 1), []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Responses</h1>
          <p className="text-sm text-muted">Every rating and comment, newest first.</p>
        </div>
        {canExport && (
          <a className="btn btn-secondary" href={exportHref}>
            <IconDownload className="h-4 w-4" />
            Export CSV
          </a>
        )}
      </header>

      <div role="tablist" aria-label="Response status" className="flex gap-1 border-b border-line">
        {(
          [
            ["confirmed", "Confirmed"],
            ["pending", "Awaiting confirmation"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={filters.status === value}
            onClick={() => update({ status: value })}
            className={`-mb-px min-h-11 border-b-2 px-3 text-sm font-semibold ${
              filters.status === value ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filters.status === "pending" && (
        <Notice kind="info">
          These clicks haven&rsquo;t been confirmed by a real browser yet. Email security scanners open links automatically; their clicks stay here and are
          never counted or charged.
        </Notice>
      )}

      <section aria-label="Filters" className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {filters.status === "confirmed" && (
            <Segmented label="Sentiment" value={filters.sentiment} options={SENTIMENT_OPTIONS} onChange={(v) => update({ sentiment: v })} />
          )}
          <label className="sr-only" htmlFor="f-channel">
            Channel
          </label>
          <select id="f-channel" className="input w-auto" value={filters.channel} onChange={(e) => update({ channel: e.target.value })}>
            <option value="">All channels</option>
            {Object.entries(CHANNEL_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={filters.hasComment} onChange={(e) => update({ hasComment: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand)]" />
            With comments only
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="f-survey" className="mb-1 block text-[13px] font-semibold text-muted">
              Survey
            </label>
            <select id="f-survey" className="input" value={filters.surveyId} onChange={(e) => update({ surveyId: e.target.value })}>
              <option value="">All surveys</option>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-agent" className="mb-1 block text-[13px] font-semibold text-muted">
              Agent
            </label>
            <input id="f-agent" className="input" placeholder="Exact name" maxLength={100} value={filters.agent} onChange={(e) => update({ agent: e.target.value })} />
          </div>
          <div>
            <label htmlFor="f-from" className="mb-1 block text-[13px] font-semibold text-muted">
              From
            </label>
            <input id="f-from" className="input" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div>
            <label htmlFor="f-to" className="mb-1 block text-[13px] font-semibold text-muted">
              To
            </label>
            <input id="f-to" className="input" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </div>
        </div>
        {filtersApplied && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
            Clear filters
          </button>
        )}
      </section>

      {error && <LoadError message={error} onRetry={load} />}

      <section aria-live="polite" aria-busy={data === null}>
        {data === null && !error ? (
          <div className="panel divide-y divide-line">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 p-4">
                <Skeleton className="h-6 w-6" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-80" />
                </div>
              </div>
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="panel">
            {filtersApplied ? (
              <EmptyState
                title="No responses match these filters"
                body="Try a wider date range or a different sentiment."
                action={
                  <button type="button" className="btn btn-secondary" onClick={clear}>
                    Clear filters
                  </button>
                }
              />
            ) : filters.status === "pending" ? (
              <EmptyState title="Nothing awaiting confirmation" body="All clicks so far have been confirmed or filtered out." />
            ) : (
              <EmptyState
                icon={<IconResponses className="h-8 w-8" />}
                title="No ratings yet"
                body="Ratings appear here the moment a customer clicks a button in your email."
                action={
                  <Link href="/app/surveys" className="btn btn-primary">
                    Get your buttons
                  </Link>
                }
              />
            )}
          </div>
        ) : data ? (
          <>
            <p className="mb-2 text-[13px] text-muted">
              {data.total} {data.total === 1 ? "response" : "responses"}
            </p>
            <ResponseTable items={data.items} />
            <ResponseCards items={data.items} />
          </>
        ) : null}
      </section>

      {data && data.total > data.limit && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {data.page} of {pages}
          </span>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
              Previous
            </button>
            <button className="btn btn-secondary btn-sm" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function ratingOf(r: ResponseItem) {
  return r.iconSet && isIconSetId(r.iconSet) && r.rating !== null ? ratingOption(r.iconSet, r.rating) : undefined;
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Rating({ r }: { r: ResponseItem }) {
  const opt = ratingOf(r);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {r.sentiment && <SentimentDot sentiment={r.sentiment} />}
      <span aria-hidden className="text-lg leading-none">
        {r.iconSet === "nps" || r.iconSet === "ces" || r.iconSet === "stars5" ? "" : opt?.symbol}
      </span>
      <span className="font-semibold">{r.iconSet === "stars5" ? `${r.rating}★ ${opt?.label ?? ""}` : (opt?.label ?? r.rating)}</span>
    </span>
  );
}

function Reasons({ r }: { r: ResponseItem }) {
  if (r.drivers.length === 0) return null;
  const tone = r.sentiment === "positive" ? "bg-pos-soft text-pos-text" : "bg-neg-soft text-neg-text";
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Reasons given">
      {r.drivers.map((d) => (
        <li key={d} className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${tone}`}>
          {d}
        </li>
      ))}
    </ul>
  );
}

function Customer({ r }: { r: ResponseItem }) {
  return (
    <>
      <span className="break-all">{r.email ?? <span className="text-muted">Not provided</span>}</span>
      {r.ticket && <span className="block text-[12px] text-muted">Ticket {r.ticket}</span>}
      {(r.email || r.agent || r.ticket) && !r.verified && (
        <span className="block text-[12px] text-muted" title="Filled in by your email tool. TapRate can't confirm it.">
          Details from your email tool
        </span>
      )}
    </>
  );
}

function ResponseTable({ items }: { items: ResponseItem[] }) {
  return (
    <div className="panel hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-[13px] text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Rating</th>
            <th scope="col" className="px-4 py-3 font-semibold">Comment</th>
            <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
            <th scope="col" className="px-4 py-3 font-semibold">Agent</th>
            <th scope="col" className="px-4 py-3 font-semibold">Survey</th>
            <th scope="col" className="px-4 py-3 font-semibold">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-3">
                <Rating r={r} />
              </td>
              {/* React renders customer text as text, never as HTML. */}
              <td className="max-w-xs whitespace-pre-wrap break-words px-4 py-3">
                {r.comment ?? (r.drivers.length ? null : <span className="text-faint">No comment</span>)}
                <Reasons r={r} />
              </td>
              <td className="max-w-[220px] px-4 py-3">
                <Customer r={r} />
              </td>
              <td className="px-4 py-3">{r.agent ?? <span className="text-faint">None</span>}</td>
              <td className="px-4 py-3">
                {r.surveyName}
                <span className="block text-[12px] text-muted">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">{when(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResponseCards({ items }: { items: ResponseItem[] }) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((r) => (
        <li key={r.id} className="panel space-y-2 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <Rating r={r} />
            <span className="shrink-0 text-[12px] text-muted">{when(r.createdAt)}</span>
          </div>
          {r.comment && <p className="whitespace-pre-wrap break-words">&ldquo;{r.comment}&rdquo;</p>}
          <Reasons r={r} />
          <div className="text-[13px] text-muted">
            <Customer r={r} />
            {r.agent && <span className="block">Agent: {r.agent}</span>}
            <span className="block">
              {r.surveyName}, via {CHANNEL_LABEL[r.channel] ?? r.channel}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ResponsesPageRoute() {
  return (
    <Suspense>
      <ResponsesView />
    </Suspense>
  );
}
