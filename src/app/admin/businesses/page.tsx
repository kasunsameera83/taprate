"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import { Badge, EmptyState, LoadError, Skeleton } from "@/components/ui";

type Row = { id: string; name: string; plan: string; credits: number; createdAt: string; suspended: boolean; ownerEmail: string | null; members: number; responses30d: number };
type Page = { page: number; pageSize: number; total: number; items: Row[] };

export default function AdminBusinesses() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setData(null);
    const t = setTimeout(() => {
      api<Page>(`/api/admin/businesses${qs({ search: search.trim() || undefined, page })}`).then((r) => {
        if (!live) return;
        if (r.ok) {
          setData(r.data);
          setError("");
        } else setError(r.message);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [search, page, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight">Businesses</h1>
        <div className="space-y-1">
          <label htmlFor="biz-search" className="sr-only">
            Search businesses
          </label>
          <input id="biz-search" className="input w-72 max-w-full" type="search" placeholder="Search name or owner email" maxLength={100} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>
      {error && <LoadError message={error} onRetry={() => setReload((n) => n + 1)} />}
      {!data && !error && <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />}
      {data && data.items.length === 0 && <EmptyState title="No businesses found" body="Try another search." />}
      {data && data.items.length > 0 && (
        <>
        <ul className="panel divide-y divide-line sm:hidden">
          {data.items.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/businesses/${b.id}`} className="block px-4 py-3 hover:bg-canvas">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{b.name}</span>
                  {b.suspended ? <Badge tone="neg">Suspended</Badge> : <span className="text-[13px] capitalize text-muted">{b.plan}</span>}
                </span>
                <span className="block text-[13px] text-muted">{b.ownerEmail ?? "no owner"}</span>
                <span className="mt-1 block text-[13px]">
                  {b.credits.toLocaleString()} left · {b.responses30d.toLocaleString()} ratings (30d) · joined {new Date(b.createdAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="panel hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="px-4 py-2.5 font-semibold">Business</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Plan</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Responses left</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Ratings (30d)</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/businesses/${b.id}`} className="font-semibold hover:underline">
                      {b.name}
                    </Link>
                    {b.suspended && (
                      <>
                        {" "}
                        <Badge tone="neg">Suspended</Badge>
                      </>
                    )}
                    <div className="text-[13px] text-muted">
                      {b.ownerEmail ?? "no owner"} · {b.members} {b.members === 1 ? "person" : "people"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 capitalize">{b.plan}</td>
                  <td className="px-4 py-2.5 text-right tabular">{b.credits.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular">{b.responses30d.toLocaleString()}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{new Date(b.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {page} of {pages} ({data.total.toLocaleString()} businesses)
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
