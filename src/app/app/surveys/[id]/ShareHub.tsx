"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, qs } from "@/lib/client/api";
import type { ResponseItem, ResponsesPage } from "@/lib/client/types";
import { isIconSetId, ratingOption } from "@/lib/surveys/iconSets";
import { isChannel, type Channel } from "@/lib/surveys/templates";
import { Skeleton } from "@/components/ui";

// The first tab of a survey: "How do you want to share it?" as big, plain cards, plus a "try it on
// your phone" box until the first rating arrives (it then celebrates). Each card opens the existing
// steps for that way of sharing.

export type ShareTarget = { tab: "buttons" | "send" | "collect"; focus?: string } | { href: string };

type Way = { id: string; title: string; body: string; emoji: string; target: ShareTarget; channels: Channel[] };

export function ShareHub({
  surveyId,
  canSeeSends,
  via,
  hasResponses,
  onOpen,
}: {
  surveyId: string;
  canSeeSends: boolean;
  via: string | null;
  hasResponses: boolean;
  onOpen: (t: { tab: "buttons" | "send" | "collect"; focus?: string }) => void;
}) {
  const ways: Way[] = [
    { id: "poster", title: "Printable QR poster", body: "Print it for your counter, tables or reception. Customers scan and tap.", emoji: "🖨️", target: { href: `/app/surveys/${encodeURIComponent(surveyId)}/poster` }, channels: ["counter"] },
    { id: "whatsapp", title: "WhatsApp or SMS", body: "A ready message with your rating link. Send it after a chat, order or visit.", emoji: "📱", target: { tab: "collect", focus: "whatsapp" }, channels: ["whatsapp"] },
    { id: "signature", title: "In your emails", body: "Add the faces to your Gmail or Outlook signature, or your helpdesk replies.", emoji: "✉️", target: { tab: "buttons" }, channels: ["email"] },
    ...(canSeeSends
      ? [{ id: "send", title: "We email your customers", body: "Paste a list of emails. TapTruly sends the survey for you, with reminders.", emoji: "📨", target: { tab: "send" as const }, channels: ["email" as Channel] }]
      : []),
    { id: "website", title: "On your website", body: "A small rating box for your contact page or order confirmation.", emoji: "🌐", target: { tab: "collect", focus: "website" }, channels: ["website"] },
    { id: "kiosk", title: "Tablet at the counter", body: "Turn any tablet into a rating stand that resets for the next customer.", emoji: "📲", target: { tab: "collect", focus: "kiosk" }, channels: ["counter"] },
    { id: "link", title: "Just a link", body: "For Facebook, Instagram bio, invoices or anywhere else.", emoji: "🔗", target: { tab: "collect", focus: "link" }, channels: [] },
  ];
  const picked: Channel | null = isChannel(via) ? via : null;
  const sorted = picked ? [...ways.filter((w) => w.channels.includes(picked)), ...ways.filter((w) => !w.channels.includes(picked))] : ways;

  return (
    <div className="space-y-6">
      {!hasResponses && <TryIt surveyId={surveyId} />}
      <section aria-labelledby="ways-title">
        <h2 id="ways-title" className="text-lg font-semibold">
          How do you want to share it?
        </h2>
        <p className="text-sm text-muted">Pick one to start. You can use as many as you like; every rating lands on the same dashboard.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((w) => {
            const recommended = picked !== null && w.channels.includes(picked);
            const inner = (
              <>
                <span className="text-[28px] leading-none" aria-hidden>
                  {w.emoji}
                </span>
                <span className="mt-3 flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {w.title}
                  {recommended && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-semibold text-brand">Best for you</span>}
                </span>
                <span className="mt-1 block text-sm text-muted">{w.body}</span>
              </>
            );
            const cls = `flex h-full w-full flex-col items-start rounded-[var(--radius-panel)] border bg-surface p-5 text-left transition-shadow hover:shadow-[0_16px_36px_-24px_rgba(15,23,42,0.5)] ${
              recommended ? "border-brand" : "border-line"
            }`;
            return (
              <li key={w.id}>
                {"href" in w.target ? (
                  <Link href={w.target.href} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" className={cls} onClick={() => onOpen(w.target as { tab: "buttons" | "send" | "collect"; focus?: string })}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** "Try it yourself": a QR code to scan with your own phone; when the first rating arrives, celebrate. */
function TryIt({ surveyId }: { surveyId: string }) {
  const [qr, setQr] = useState<{ svg: string; link: string } | null>(null);
  const [first, setFirst] = useState<ResponseItem | null>(null);
  const started = useRef(Date.now());

  useEffect(() => {
    api<{ qr: { svg: string; link: string } }>(`/api/surveys/${encodeURIComponent(surveyId)}/share`).then((r) => r.ok && setQr(r.data.qr));
  }, [surveyId]);

  // Check every 4 seconds for up to 15 minutes while this box is on screen.
  useEffect(() => {
    if (first) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - started.current > 15 * 60_000) return clearInterval(t);
      api<ResponsesPage>(`/api/responses${qs({ surveyId, limit: 1 })}`).then((r) => {
        if (r.ok && r.data.items[0]) setFirst(r.data.items[0]);
      });
    }, 4000);
    return () => clearInterval(t);
  }, [surveyId, first]);

  if (first) {
    const opt = first.iconSet && isIconSetId(first.iconSet) && first.rating !== null ? ratingOption(first.iconSet, first.rating) : undefined;
    return (
      <section role="status" className="panel flex flex-col items-center gap-3 p-8 text-center">
        <span className="animate-bounce text-[56px] leading-none motion-reduce:animate-none" aria-hidden>
          {opt?.symbol ?? "🎉"}
        </span>
        <h2 className="text-[22px] font-bold">Your first rating just arrived!</h2>
        <p className="max-w-md text-sm text-muted">
          You tapped &ldquo;{opt?.label ?? first.rating}&rdquo;. That&rsquo;s exactly what your customers will do. It&rsquo;s already on your dashboard.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/app" className="btn btn-secondary">
            See the dashboard
          </Link>
          <a href="#ways-title" className="btn btn-primary">
            Now share it with customers
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="panel flex flex-col items-center gap-5 p-5 sm:flex-row sm:p-6" aria-labelledby="try-title">
      <div className="h-[150px] w-[150px] shrink-0">
        {qr ? (
          // Our own server-made SVG, shown as an image (never inserted as HTML).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.svg)}`} alt="QR code for your survey" width={150} height={150} className="rounded-[10px] border border-line" />
        ) : (
          <Skeleton className="h-full w-full" />
        )}
      </div>
      <div className="text-center sm:text-left">
        <h2 id="try-title" className="text-lg font-semibold">
          Try it yourself first
        </h2>
        <p className="mt-1 text-sm text-muted">Point your phone camera at this code and tap a face. Watch this box: your rating will pop up here in a few seconds.</p>
        {qr && (
          <a href={qr.link} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
            No phone handy? Open it on this computer
          </a>
        )}
        <p className="mt-2 flex items-center justify-center gap-2 text-[13px] text-muted sm:justify-start">
          <span className="h-2 w-2 animate-pulse rounded-full bg-pos-fill" aria-hidden />
          Waiting for your rating…
        </p>
      </div>
    </section>
  );
}
