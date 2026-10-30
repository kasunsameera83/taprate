"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { NotificationItem, NotificationsData } from "@/lib/client/types";

// Live updates for the signed-in app, without refreshing the page:
//  - checks for news every 30 seconds while the tab is open and visible (and straight away when you come back to it)
//  - a bell with a count, and a list of what's new
//  - a small pop-up when a new rating arrives, and pages like the dashboard and Responses reload their data
//  - the tab title shows the count, e.g. "(3) Dashboard"
// One checker for the whole app (the bell appears twice, in the sidebar and the phone header).

const POLL_MS = 30_000;
export const RESPONSES_CHANGED = "tt:responses-changed";

type Toast = { id: string; title: string; body: string | null; href: string; unhappy: boolean };
type Ctx = { data: NotificationsData | null; markSeen: () => void };
const NotifCtx = createContext<Ctx>({ data: null, markSeen: () => {} });

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<NotificationsData | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastLatest = useRef<string | null | undefined>(undefined);
  const seenToast = useRef(new Set<string>());
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState !== "visible") return;
    busy.current = true;
    const r = await api<NotificationsData>("/api/notifications");
    busy.current = false;
    if (!r.ok) return;
    setData(r.data);
    const first = lastLatest.current === undefined;
    if (!first && r.data.latestId && r.data.latestId !== lastLatest.current) {
      // New rating(s) since the last check: pop up the newest few and let open pages reload.
      const fresh = r.data.items.filter((i) => (i.kind === "rating" || i.kind === "unhappy") && i.id !== "r:more" && !seenToast.current.has(i.id)).slice(0, 3);
      fresh.forEach((i) => seenToast.current.add(i.id));
      if (fresh.length) setToasts((t) => [...fresh.map((i) => ({ id: i.id, title: i.title, body: i.body, href: i.href, unhappy: i.kind === "unhappy" })), ...t].slice(0, 3));
      window.dispatchEvent(new Event(RESPONSES_CHANGED));
    }
    if (first) r.data.items.forEach((i) => seenToast.current.add(i.id)); // no pop-ups for what was already there
    lastLatest.current = r.data.latestId;
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [check]);

  // "(3) Dashboard" in the browser tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    const n = data?.unread ?? 0;
    document.title = n > 0 ? `(${n > 99 ? "99+" : n}) ${base}` : base;
  }, [data?.unread]);

  // Pop-ups close by themselves after a while.
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((all) => all.slice(0, -1)), 7000);
    return () => clearTimeout(t);
  }, [toasts]);

  const markSeen = useCallback(async () => {
    setData((d) => (d ? { ...d, unread: 0, items: d.items.map((i) => ({ ...i, unread: false })) } : d));
    await api("/api/notifications/seen", { method: "POST" });
  }, []);

  return (
    <NotifCtx.Provider value={{ data, markSeen }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-24 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 lg:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className="nt-toast pointer-events-auto flex items-start gap-3 rounded-[14px] border border-line bg-surface p-3 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)]">
            <span aria-hidden className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${t.unhappy ? "bg-neg-fill" : "bg-pos-fill"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 truncate text-[13px] text-muted">{t.body}</p>}
              <Link href={t.href} className="mt-1 inline-block text-[13px] font-semibold text-brand hover:underline" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
                {t.unhappy ? "Follow up" : "View"}
              </Link>
            </div>
            <button type="button" aria-label="Dismiss" className="-m-1 rounded p-1 text-muted hover:text-ink" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </NotifCtx.Provider>
  );
}

/** Reload a page's data when new ratings arrive. */
export function useOnResponsesChanged(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener(RESPONSES_CHANGED, h);
    return () => window.removeEventListener(RESPONSES_CHANGED, h);
  }, []);
}

const DOT: Record<NotificationItem["kind"], string> = {
  rating: "bg-pos-fill",
  unhappy: "bg-neg-fill",
  followups: "bg-brand",
  credits: "bg-neu-fill",
  billing: "bg-neg-fill",
  team: "bg-brand",
};

function ago(iso: string | null) {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The bell. `align` decides which side the list opens towards. */
export function NotificationBell({ align = "left" }: { align?: "left" | "right" }) {
  const { data, markSeen } = useContext(NotifCtx);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];
  const attention = items.filter((i) => !i.unread).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${unread ? "nt-ring" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-neg-fill px-1.5 text-center text-[11px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span>
        ) : attention > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-neu-fill ring-2 ring-surface" aria-hidden />
        ) : null}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={`absolute top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-[14px] border border-line bg-surface shadow-[0_24px_48px_-20px_rgba(15,23,42,0.45)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 && (
              <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={markSeen}>
                Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You&rsquo;re all caught up.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={i.href}
                    onClick={() => {
                      setOpen(false);
                      if (i.unread) markSeen();
                    }}
                    className={`flex gap-3 px-4 py-2.5 hover:bg-canvas ${i.unread ? "bg-brand-soft/40" : ""}`}
                  >
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[i.kind]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{i.title}</span>
                      {i.body && <span className="block truncate text-[13px] text-muted">{i.body}</span>}
                      {i.at && <span className="block text-[12px] text-muted">{ago(i.at)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
