"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client/api";
import { Badge, LoadError, Skeleton } from "@/components/ui";

type Timeline = {
  email: string;
  summary: { total: number; positive: number; negative: number; first: string | null; last: string | null };
  ratings: Array<{
    id: string;
    rating: number | null;
    sentiment: "positive" | "neutral" | "negative" | null;
    comment: string | null;
    channel: string | null;
    survey: string;
    location: string | null;
    followup: string | null;
    resolvedAt: string | null;
    wonBack: boolean;
    at: string;
  }>;
  emails: Array<{ id: string; name: string; status: string; at: string }>;
};

type Item = { kind: "rating"; at: string; r: Timeline["ratings"][number] } | { kind: "email"; at: string; e: Timeline["emails"][number] };

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const TONE = { positive: "pos", neutral: "neu", negative: "neg" } as const;
const LABEL = { positive: "Happy", neutral: "Okay", negative: "Unhappy" } as const;

/** A button showing the customer's email that opens everything they've told this business. */
export function CustomerTimelineButton({ email }: { email: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // The dialog goes at the end of <body>, so the button can sit inside a paragraph or table cell.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="link break-all text-left"
        title="See this customer's history"
        onClick={() => setOpen(true)}
      >
        {email}
      </button>
      {mounted && open && createPortal(
      <dialog
        ref={ref}
        aria-label={`History for ${email}`}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-auto rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Customer history</h2>
              <p className="break-all text-sm text-muted">{email}</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.close()}>
              Close
            </button>
          </div>
          <TimelineBody email={email} />
        </div>
      </dialog>,
      document.body,
      )}
    </>
  );
}

function TimelineBody({ email }: { email: string }) {
  const [data, setData] = useState<Timeline | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    api<Timeline>("/api/customers/timeline", { method: "POST", body: { email } }).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [email, tick]);

  if (error) return <div className="mt-4"><LoadError message={error} onRetry={() => setTick((t) => t + 1)} /></div>;
  if (!data) return <Skeleton className="mt-4 h-48 w-full rounded-[var(--radius-panel)]" />;

  const items: Item[] = [
    ...data.ratings.map((r) => ({ kind: "rating" as const, at: r.at, r })),
    ...data.emails.map((e) => ({ kind: "email" as const, at: e.at, e })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const s = data.summary;

  return (
    <>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-line p-2">
          <dt className="text-[12px] text-muted">Ratings</dt>
          <dd className="text-lg font-semibold tabular-nums">{s.total}</dd>
        </div>
        <div className="rounded-lg border border-line p-2">
          <dt className="text-[12px] text-muted">Happy</dt>
          <dd className="text-lg font-semibold tabular-nums">{s.positive}</dd>
        </div>
        <div className="rounded-lg border border-line p-2">
          <dt className="text-[12px] text-muted">Unhappy</dt>
          <dd className="text-lg font-semibold tabular-nums">{s.negative}</dd>
        </div>
      </dl>
      {s.first && <p className="mt-2 text-[12px] text-muted">Customer since {new Date(s.first).toLocaleDateString()}</p>}
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No ratings from this customer yet.</p>
      ) : (
        <ol className="mt-4 space-y-3 border-l border-line pl-4">
          {items.map((it) =>
            it.kind === "rating" ? (
              <li key={`r${it.r.id}`} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {it.r.sentiment && <Badge tone={TONE[it.r.sentiment]}>{LABEL[it.r.sentiment]}</Badge>}
                  <span className="font-medium">{it.r.survey}</span>
                  {it.r.location && <span className="text-muted">· {it.r.location}</span>}
                  {it.r.wonBack && <Badge tone="brand">Won back</Badge>}
                </div>
                {/* Customer text is rendered as plain text (React escapes it). */}
                {it.r.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm">&ldquo;{it.r.comment}&rdquo;</p>}
                <p className="mt-0.5 text-[12px] text-muted">
                  {fmt(it.at)}
                  {it.r.followup && ` · Follow-up ${it.r.followup.replace("_", " ")}`}
                </p>
              </li>
            ) : (
              <li key={`e${it.e.id}`} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-line bg-surface" aria-hidden />
                <p className="text-sm">
                  Emailed: <span className="font-medium">{it.e.name}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-muted">{fmt(it.at)}</p>
              </li>
            ),
          )}
        </ol>
      )}
    </>
  );
}
