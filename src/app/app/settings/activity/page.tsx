"use client";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import { EmptyState, LoadError, Skeleton } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";

type Entry = { id: string; actor: string; action: string; targetType: string | null; metadata: Record<string, string | number | boolean | null>; createdAt: string };
type Page = { page: number; total: number; pageSize: number; items: Entry[] };

// Plain-language names for log entries.
const ACTIONS: Record<string, string> = {
  "survey.create": "Created a survey",
  "survey.update": "Edited a survey",
  "survey.archive": "Archived a survey",
  "responses.export": "Exported responses",
  "account.rename": "Renamed the business",
  "account.export": "Downloaded a full data export",
  "account.create": "Created the business",
  "team.invite": "Invited a teammate",
  "team.invite_revoked": "Cancelled an invite",
  "team.joined": "Joined the team",
  "team.left": "Left the team",
  "team.role_changed": "Changed a teammate's role",
  "team.removed": "Removed a teammate",
  "privacy.customer_erased": "Deleted a customer's data",
  "auth.mfa_enabled": "Turned on two-step verification",
  "auth.mfa_disabled": "Turned off two-step verification",
  "auth.email_change_requested": "Requested an email change",
  "auth.signed_out_everywhere": "Signed out on all devices",
  "followup.resolved": "Resolved a follow-up",
  "followup.updated": "Updated a follow-up",
  "account.logo_updated": "Changed the logo",
  "account.logo_removed": "Removed the logo",
  "kiosk.created": "Created a kiosk link",
  "kiosk.revoked": "Switched off a kiosk",
  "integration.created": "Connected an integration",
  "integration.updated": "Changed an integration",
  "integration.deleted": "Removed an integration",
  "apikey.created": "Created an API key",
  "apikey.revoked": "Revoked an API key",
  "import.created": "Imported past ratings",
  "import.deleted": "Undid an import",
  "billing.profile_updated": "Updated billing details",
  "billing.checkout_started": "Started a payment",
  "billing.paid": "Payment received",
  "billing.cancelled": "Cancelled the plan",
};

function describe(e: Entry): string {
  const base = ACTIONS[e.action] ?? e.action;
  if (e.action === "team.invite" || e.action === "team.role_changed") return `${base} (${String(e.metadata.role ?? "")})`;
  if (e.action === "responses.export" || e.action === "account.export") return e.metadata.rows ? `${base} (${e.metadata.rows} rows)` : base;
  if (e.action === "import.created" || e.action === "import.deleted") return `${base} (${e.metadata.rows ?? 0} ratings)`;
  if (e.action === "privacy.customer_erased") return `${base} (${e.metadata.deleted ?? 0} ratings)`;
  return base;
}

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    setData(null);
    api<Page>(`/api/audit${qs({ page })}`).then((r) => (r.ok ? setData(r.data) : setError(r.message)));
  }, [page]);
  useEffect(load, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <SettingsSection title="Activity" description="Important changes in this business: who did what, and when. The log can't be edited.">
      {error && <LoadError message={error} onRetry={load} />}
      {!data && !error && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}
      {data && data.items.length === 0 && <EmptyState title="No activity yet" body="Changes to surveys, the team and settings will be listed here." />}
      {data && data.items.length > 0 && (
        <>
          <ul className="divide-y divide-line">
            {data.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{e.actor}</span> <span className="text-muted">{describe(e).toLowerCase()}</span>
                </span>
                <time dateTime={e.createdAt} className="text-[13px] text-muted">
                  {new Date(e.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </time>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted">
                Page {data.page} of {pages}
              </span>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </SettingsSection>
  );
}
