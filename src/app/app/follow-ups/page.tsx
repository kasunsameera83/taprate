"use client";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api, qs } from "@/lib/client/api";
import { followupNoteSchema, fieldErrors } from "@/lib/validation/schemas";
import { isIconSetId, ratingOption } from "@/lib/surveys/iconSets";
import type { ResponseItem } from "@/lib/client/types";
import { Badge, EmptyState, LoadError, Notice, Skeleton } from "@/components/ui";
import { IconFollowUp } from "@/components/icons";

type Status = "active" | "overdue" | "open" | "in_progress" | "resolved";
type Item = ResponseItem & { noteCount: number };
type Page = { page: number; pageSize: number; total: number; counts: { active: number; overdue: number }; items: Item[] };
type Member = { userId: string; email: string; role: string };
type Me = { role: string | null; userId: string };

const TABS: Array<{ value: Status; label: string }> = [
  { value: "active", label: "To do" },
  { value: "overdue", label: "Overdue" },
  { value: "resolved", label: "Resolved" },
];

const STATUS_LABEL = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;

function dueText(dueAt: string | null): { text: string; overdue: boolean } {
  if (!dueAt) return { text: "No due date", overdue: false };
  const diffH = Math.round((Date.parse(dueAt) - Date.now()) / 3600000);
  if (diffH < 0) return { text: diffH > -24 ? `Overdue by ${-diffH} h` : `Overdue by ${Math.round(-diffH / 24)} d`, overdue: true };
  if (diffH < 24) return { text: `Due in ${Math.max(1, diffH)} h`, overdue: false };
  return { text: `Due in ${Math.round(diffH / 24)} d`, overdue: false };
}

function FollowUpsView() {
  const search = useSearchParams();
  const initialStatus = (["active", "overdue", "resolved"] as const).find((s) => s === search.get("status")) ?? "active";
  const [status, setStatus] = useState<Status>(initialStatus);
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<{ role: string | null; userId: string }>("/api/account").then((r) => {
      if (!r.ok) return;
      const role = r.data.role;
      setMe({ role, userId: r.data.userId });
      if (role === "owner" || role === "admin") {
        api<{ members: Member[] }>("/api/team").then((t) => t.ok && setMembers(t.data.members));
      }
    });
  }, []);

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    api<Page>(`/api/followups${qs({ status, mine: mine ? "yes" : undefined, page })}`).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [status, mine, page, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const canManage = me?.role === "owner" || me?.role === "admin";
  const canAct = canManage || me?.role === "agent";
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[28px] font-bold leading-tight">Follow-ups</h1>
        <p className="text-sm text-muted">Every negative rating becomes a task. Call or email the customer, add a note, then resolve it.</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Follow-up status" className="flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={status === t.value}
              onClick={() => {
                setStatus(t.value);
                setPage(1);
              }}
              className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${
                status === t.value ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {data && t.value === "active" && data.counts.active > 0 && <Badge tone="plain">{data.counts.active}</Badge>}
              {data && t.value === "overdue" && data.counts.overdue > 0 && <Badge tone="neg">{data.counts.overdue}</Badge>}
            </button>
          ))}
        </div>
        {canAct && (
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            Assigned to me
          </label>
        )}
      </div>

      {error && <LoadError message={error} onRetry={refresh} />}

      {!data && !error ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-[var(--radius-panel)]" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<IconFollowUp className="h-8 w-8" />}
            title={status === "resolved" ? "Nothing resolved yet" : status === "overdue" ? "Nothing overdue" : "You're all caught up"}
            body={status === "resolved" ? "Resolved follow-ups will be listed here." : "New negative ratings will appear here as tasks."}
          />
        </div>
      ) : data ? (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <FollowUpCard key={item.id} item={item} members={members} canManage={canManage} canAct={canAct} myUserId={me?.userId ?? ""} onChanged={refresh} />
          ))}
        </ul>
      ) : null}

      {data && data.total > data.pageSize && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
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
    </div>
  );
}

function FollowUpCard({
  item,
  members,
  canManage,
  canAct,
  myUserId,
  onChanged,
}: {
  item: Item;
  members: Member[];
  canManage: boolean;
  canAct: boolean;
  myUserId: string;
  onChanged: () => void;
}) {
  const f = item.followup!;
  const opt = item.iconSet && isIconSetId(item.iconSet) && item.rating !== null ? ratingOption(item.iconSet, item.rating) : undefined;
  const due = dueText(f.dueAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const assignee = members.find((m) => m.userId === f.assigneeId);
  // Agents may only change status of follow-ups assigned to them (the database enforces this too).
  const canChangeStatus = canManage || (canAct && f.assigneeId !== null && f.assigneeId === myUserId);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const r = await api(`/api/followups/${encodeURIComponent(item.id)}`, { method: "PATCH", body });
    setBusy(false);
    if (r.ok) onChanged();
    else setError(r.message);
  }

  return (
    <li className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <span className="mr-1 text-lg" aria-hidden>
              {item.iconSet === "nps" || item.iconSet === "ces" ? "" : opt?.symbol}
            </span>
            <span className="font-semibold">{item.email ?? "Unknown customer"}</span>
            <span className="text-muted"> rated {opt?.label ?? item.rating}</span>
            {item.agent && <span className="text-muted"> for {item.agent}</span>}
          </p>
          {item.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm">&ldquo;{item.comment}&rdquo;</p>}
          {item.drivers.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Reasons given">
              {item.drivers.map((d) => (
                <li key={d} className="rounded-full bg-neg-soft px-2.5 py-0.5 text-[12px] font-semibold text-neg-text">
                  {d}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-muted">
            {item.surveyName}
            {item.ticket ? `, ticket ${item.ticket}` : ""}, {new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <Badge tone={f.status === "resolved" ? "pos" : f.status === "in_progress" ? "brand" : "plain"}>{STATUS_LABEL[f.status]}</Badge>
          {f.status !== "resolved" && <span className={`text-[12px] font-semibold ${due.overdue ? "text-neg-text" : "text-muted"}`}>{due.text}</span>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {canManage ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Owner</span>
            <select
              className="input min-h-9 w-auto py-1 text-sm"
              value={f.assigneeId ?? ""}
              disabled={busy}
              onChange={(e) => patch({ assigneeId: e.target.value || null })}
              aria-label="Assign to"
            >
              <option value="">Unassigned</option>
              {members
                .filter((m) => m.role !== "viewer")
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.email}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <span className="text-sm text-muted">{f.assigneeId ? (f.assigneeId === myUserId ? "Assigned to you" : `Assigned${assignee ? ` to ${assignee.email}` : ""}`) : "Unassigned"}</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNotes((s) => !s)} aria-expanded={showNotes}>
            Notes{item.noteCount ? ` (${item.noteCount})` : ""}
          </button>
          {canChangeStatus && f.status === "open" && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => patch({ status: "in_progress" })}>
              Start
            </button>
          )}
          {canChangeStatus && f.status !== "resolved" && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => patch({ status: "resolved" })}>
              Resolve
            </button>
          )}
          {canChangeStatus && f.status === "resolved" && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => patch({ status: "open" })}>
              Reopen
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {showNotes && <Notes responseId={item.id} canWrite={canAct} onAdded={onChanged} />}
    </li>
  );
}

function Notes({ responseId, canWrite, onAdded }: { responseId: string; canWrite: boolean; onAdded: () => void }) {
  const [notes, setNotes] = useState<Array<{ id: string; author: string; body: string; createdAt: string }> | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Array<{ id: string; author: string; body: string; createdAt: string }>>(`/api/followups/${encodeURIComponent(responseId)}/notes`).then((r) =>
      r.ok ? setNotes(r.data) : setError(r.message),
    );
  }, [responseId]);
  useEffect(load, [load]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = followupNoteSchema.safeParse({ body: draft });
    if (!parsed.success) return setError(Object.values(fieldErrors(parsed.error))[0] ?? "Check the note");
    setBusy(true);
    setError("");
    const r = await api(`/api/followups/${encodeURIComponent(responseId)}/notes`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setDraft("");
      load();
      onAdded();
    } else setError(r.message);
  }

  return (
    <div className="mt-3 space-y-3 rounded-[10px] bg-canvas p-3">
      {notes === null ? (
        <Skeleton className="h-10 w-full" />
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              <p className="whitespace-pre-wrap break-words">{n.body}</p>
              <p className="text-[12px] text-muted">
                {n.author}, {new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={add} noValidate className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={`note-${responseId}`} className="sr-only">
            Add a note
          </label>
          <textarea
            id={`note-${responseId}`}
            className="input min-h-11"
            rows={1}
            maxLength={2000}
            placeholder="What did you do? e.g. Called, offered a refund"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-secondary shrink-0" disabled={busy || !draft.trim()}>
            Add note
          </button>
        </form>
      )}
      {error && <p className="text-[13px] text-neg-text">{error}</p>}
    </div>
  );
}

export default function FollowUpsPage() {
  return (
    <Suspense>
      <FollowUpsView />
    </Suspense>
  );
}
