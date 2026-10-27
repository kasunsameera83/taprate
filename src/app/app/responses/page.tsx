"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, qs } from "@/lib/client/api";
import type { ResponsesPage, Survey } from "@/lib/client/types";
import { ratingOption, isIconSetId } from "@/lib/surveys/iconSets";
import { responsesQuerySchema, fieldErrors } from "@/lib/validation/schemas";
import { FormMessage } from "@/components/ui";

type Filters = { surveyId: string; status: "confirmed" | "pending"; from: string; to: string; agent: string; page: number };

function ResponsesView() {
  const search = useSearchParams();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [filters, setFilters] = useState<Filters>({
    surveyId: search.get("surveyId") ?? "",
    status: "confirmed",
    from: "",
    to: "",
    agent: "",
    page: 1,
  });
  const [data, setData] = useState<ResponsesPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Survey[]>("/api/surveys").then((r) => r.ok && setSurveys(r.data));
  }, []);

  useEffect(() => {
    const query = {
      surveyId: filters.surveyId || undefined,
      status: filters.status,
      from: filters.from || undefined,
      to: filters.to || undefined,
      agent: filters.agent || undefined,
      page: filters.page,
      limit: 25,
    };
    const check = responsesQuerySchema.safeParse(query);
    if (!check.success) {
      setError(Object.values(fieldErrors(check.error))[0] ?? "Check the filters.");
      return;
    }
    const t = setTimeout(() => {
      api<ResponsesPage>(`/api/responses${qs(query)}`).then((r) => {
        if (r.ok) {
          setData(r.data);
          setError("");
        } else setError(r.message);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [filters]);

  const exportHref = `/api/responses/export${qs({ surveyId: filters.surveyId || undefined, from: filters.from || undefined, to: filters.to || undefined })}`;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Responses</h1>
        <a className="btn btn-secondary" href={exportHref}>
          Export CSV
        </a>
      </div>

      <div className="panel grid gap-3 p-4 md:grid-cols-5">
        <select className="input" value={filters.surveyId} onChange={(e) => update({ surveyId: e.target.value })} aria-label="Survey">
          <option value="">All surveys</option>
          {surveys.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="input" value={filters.status} onChange={(e) => update({ status: e.target.value as Filters["status"] })} aria-label="Status">
          <option value="confirmed">Confirmed</option>
          <option value="pending">Awaiting confirmation</option>
        </select>
        <input className="input" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} aria-label="From date" />
        <input className="input" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} aria-label="To date" />
        <input className="input" placeholder="Agent name" maxLength={100} value={filters.agent} onChange={(e) => update({ agent: e.target.value })} aria-label="Agent" />
      </div>

      <FormMessage kind="error">{error}</FormMessage>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-[var(--muted)]">
            <tr>
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Rating</th>
              <th className="p-3 font-medium">Comment</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Agent</th>
              <th className="p-3 font-medium">Survey</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[var(--muted)]">
                  No responses match these filters.
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const opt = r.iconSet && isIconSetId(r.iconSet) && r.rating !== null ? ratingOption(r.iconSet, r.rating) : undefined;
              return (
                <tr key={r.id} className="border-t border-[var(--line)] align-top">
                  <td className="whitespace-nowrap p-3">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="whitespace-nowrap p-3" style={{ color: opt?.color }}>
                    {opt ? `${opt.symbol} ${opt.label}` : r.rating}
                  </td>
                  {/* React escapes all of this text: customer input can never become HTML/script. */}
                  <td className="max-w-xs whitespace-pre-wrap break-words p-3">{r.comment ?? <span className="text-[var(--muted)]">—</span>}</td>
                  <td className="p-3">
                    {r.email ?? "—"}
                    {r.ticket && <div className="text-xs text-[var(--muted)]">Ticket {r.ticket}</div>}
                    {(r.email || r.agent || r.ticket) && !r.verified && (
                      <div className="text-xs text-[var(--muted)]" title="Filled in by your email tool, not signed by TapRate">
                        unverified details
                      </div>
                    )}
                  </td>
                  <td className="p-3">{r.agent ?? "—"}</td>
                  <td className="p-3">{r.surveyName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">
            Page {data.page} of {pages} · {data.total} responses
          </span>
          <div className="flex gap-2">
            <button className="btn btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
              Previous
            </button>
            <button className="btn btn-secondary" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResponsesPageRoute() {
  return (
    <Suspense>
      <ResponsesView />
    </Suspense>
  );
}
