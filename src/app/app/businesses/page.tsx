"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, EmptyState, LoadError } from "@/components/ui";
import { PageLoader } from "@/components/FaceLoader";

type Biz = {
  id: string;
  name: string;
  role: "owner" | "admin" | "viewer";
  plan: string | null;
  credits: number | null;
  responses30d: number;
  satisfaction: number | null;
  negative30d: number;
  openFollowups: number;
};
type Overview = { currentId: string; businesses: Biz[] };
type Sort = "name" | "satisfaction" | "followups";

const ROLE: Record<Biz["role"], string> = { owner: "Owner", admin: "Admin", viewer: "Viewer" };

export default function BusinessesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<Sort>("followups");
  const [switching, setSwitching] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Overview>("/api/agency").then((r) => (r.ok ? setData(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  async function open(id: string, href = "/app") {
    if (data && id === data.currentId) return window.location.assign(href);
    setSwitching(id);
    const r = await api("/api/account/switch", { method: "POST", body: { accountId: id } });
    if (r.ok) window.location.assign(href);
    else {
      setSwitching("");
      setError(r.message);
    }
  }

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!data) return <PageLoader className="h-96" />;

  const rows = [...data.businesses].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name) : sort === "satisfaction" ? (a.satisfaction ?? 101) - (b.satisfaction ?? 101) : b.openFollowups - a.openFollowups,
  );
  const totals = data.businesses.reduce((t, b) => ({ r: t.r + b.responses30d, f: t.f + b.openFollowups }), { r: 0, f: 0 });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">All businesses</h1>
        <p className="text-sm text-muted">
          {data.businesses.length} businesses · {totals.r} ratings in the last 30 days · {totals.f} open follow-ups
        </p>
      </header>
      {rows.length === 0 ? (
        <EmptyState title="No businesses to show" body="Businesses where you're an owner, admin or viewer appear here." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Your businesses, last 30 days</caption>
            <thead className="text-left text-[12px] text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="p-3">
                  <button type="button" className="font-semibold hover:text-ink" aria-pressed={sort === "name"} onClick={() => setSort("name")}>Business</button>
                </th>
                <th scope="col" className="p-3 text-right">Ratings (30 days)</th>
                <th scope="col" className="p-3 text-right">
                  <button type="button" className="font-semibold hover:text-ink" aria-pressed={sort === "satisfaction"} onClick={() => setSort("satisfaction")}>Happy</button>
                </th>
                <th scope="col" className="p-3 text-right">
                  <button type="button" className="font-semibold hover:text-ink" aria-pressed={sort === "followups"} onClick={() => setSort("followups")}>Open follow-ups</button>
                </th>
                <th scope="col" className="p-3 text-right">Responses left</th>
                <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="p-3">
                    <span className="font-semibold">{b.name}</span>
                    {b.id === data.currentId && <span className="ml-2"><Badge tone="brand">Open now</Badge></span>}
                    <span className="block text-[12px] text-muted">{ROLE[b.role]}{b.plan ? ` · ${b.plan}` : ""}</span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{b.responses30d}</td>
                  <td className="p-3 text-right tabular-nums">
                    {b.satisfaction === null ? <span className="text-muted">–</span> : <Badge tone={b.satisfaction >= 80 ? "pos" : b.satisfaction >= 60 ? "neu" : "neg"}>{b.satisfaction}%</Badge>}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {b.openFollowups > 0 ? (
                      <button type="button" className="link" disabled={!!switching} onClick={() => open(b.id, "/app/follow-ups")}>{b.openFollowups}</button>
                    ) : (
                      0
                    )}
                  </td>
                  <td className={`p-3 text-right tabular-nums ${b.credits !== null && b.credits < 50 ? "font-semibold text-neg-text" : ""}`}>{b.credits ?? "–"}</td>
                  <td className="p-3 text-right">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!!switching} onClick={() => open(b.id)}>
                      {switching === b.id ? "Opening…" : "Open"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
