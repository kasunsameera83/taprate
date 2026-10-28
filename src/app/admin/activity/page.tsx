"use client";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import { EmptyState, LoadError, Skeleton } from "@/components/ui";

type Entry = { id: number; admin_id: string | null; action: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown>; created_at: string };
type Page = { page: number; total: number; pageSize: number; items: Entry[] };

const LABEL: Record<string, string> = {
  "business.credits_adjusted": "Adjusted responses",
  "business.suspended": "Suspended a business",
  "business.restored": "Restored a business",
  "landing.draft_saved": "Saved the landing page draft",
  "landing.published": "Published the landing page",
  "promotion.created": "Created a pop-up/greeting",
  "promotion.updated": "Changed a pop-up/greeting",
  "promotion.deleted": "Deleted a pop-up/greeting",
  "pricing.updated": "Changed prices",
  "promo.created": "Created a promo code",
  "promo.updated": "Changed a promo code",
  "promo.deleted": "Deleted a promo code",
};

export default function AdminActivity() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    api<Page>(`/api/admin/activity${qs({ page })}`).then((r) => (r.ok ? setData(r.data) : setError(r.message)));
  }, [page]);
  if (error) return <LoadError message={error} onRetry={() => setPage((p) => p)} />;
  if (!data) return <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-bold leading-tight">Admin log</h1>
      <p className="text-sm text-muted">Every change made in the admin area. It can&rsquo;t be edited or deleted.</p>
      {data.items.length === 0 ? (
        <EmptyState title="No admin activity yet" body="Changes you make here will be listed." />
      ) : (
        <ul className="panel divide-y divide-line">
          {data.items.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{LABEL[e.action] ?? e.action}</span>
                {e.target_id && <span className="text-muted"> · {e.target_type} {e.target_id.slice(0, 12)}</span>}
                {typeof e.metadata.reason === "string" && <span className="text-muted"> · “{e.metadata.reason}”</span>}
                {typeof e.metadata.amount === "number" && <span className="text-muted"> · {e.metadata.amount > 0 ? "+" : ""}{e.metadata.amount}</span>}
              </span>
              <span className="text-muted">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
