"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client/api";
import { useAllows } from "@/components/PlanContext";
import { FaceLoader } from "@/components/FaceLoader";

type Card = { page: string; image: string; square: string; text: string };

// "Share" on a happy, consented comment: makes a picture card and offers WhatsApp, Facebook, LinkedIn, X,
// an Instagram-size download, copy link, and the phone's own share menu. The server decides if it's allowed.
export function ShareCardButton({ responseId }: { responseId: string }) {
  const allowed = useAllows("social");
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);

  async function start() {
    setOpen(true);
    if (card) return;
    setBusy(true);
    setErr("");
    const r = await api<Card>(`/api/responses/${encodeURIComponent(responseId)}/share-card`, { method: "POST" });
    setBusy(false);
    if (r.ok) setCard(r.data);
    else setErr(r.message);
  }

  const enc = encodeURIComponent;
  const links = card
    ? [
        { label: "WhatsApp", color: "#25D366", href: `https://wa.me/?text=${enc(`${card.text} ${card.page}`)}` },
        { label: "Facebook", color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(card.page)}` },
        { label: "LinkedIn", color: "#0A66C2", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(card.page)}` },
        { label: "X", color: "#0f172a", href: `https://twitter.com/intent/tweet?text=${enc(card.text)}&url=${enc(card.page)}` },
      ]
    : [];

  async function download() {
    if (!card) return;
    const blob = await (await fetch(card.square)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "customer-review.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function nativeShare() {
    if (!card) return;
    try {
      const blob = await (await fetch(card.square)).blob();
      const file = new File([blob], "customer-review.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${card.text} ${card.page}` });
      else await navigator.share({ text: card.text, url: card.page });
    } catch {
      /* cancelled */
    }
  }

  if (!allowed) {
    return (
      <Link href="/app/settings/billing" className="ml-2 text-[12px] font-semibold text-muted hover:text-ink" title="Social media share cards come with any paid plan">
        Share (paid plans)
      </Link>
    );
  }

  return (
    <>
      <button type="button" className="ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-3.5 text-[12px] font-bold text-white shadow-[0_6px_14px_-6px_rgba(79,70,229,0.7)] transition-transform hover:-translate-y-px hover:shadow-[0_10px_18px_-8px_rgba(79,70,229,0.8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={start}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
        </svg>
        Share
      </button>
      {mounted &&
        open &&
        createPortal(
          <dialog
            ref={ref}
            aria-label="Share this review"
            onClose={() => setOpen(false)}
            onClick={(e) => {
              if (e.target === ref.current) ref.current?.close();
            }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-auto rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
          >
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Share this review</h2>
                  <p className="text-sm text-muted">The customer agreed to share it. Only their chosen name is shown.</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.close()}>
                  Close
                </button>
              </div>
              {busy && <div className="py-6"><FaceLoader label="Making your card" /></div>}
              {err && <p className="text-sm font-medium text-neg-text">{err}</p>}
              {card && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image}
                    alt="Preview of the share card"
                    className="aspect-[1200/630] w-full rounded-[12px] border border-line bg-canvas object-cover"
                    onError={() => setErr("The picture couldn't be made just now. The links still work; try again in a minute.")}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {links.map((l) => (
                      <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="btn border-0 text-white hover:opacity-90" style={{ backgroundColor: l.color }}>
                        {l.label}
                      </a>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn border-0 bg-[linear-gradient(45deg,#f58529,#dd2a7b,#8134af)] text-white hover:opacity-90" onClick={download}>
                      Download for Instagram
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={async () => {
                        await navigator.clipboard.writeText(card.page);
                        setNote("Link copied.");
                      }}
                    >
                      Copy link
                    </button>
                    {typeof navigator !== "undefined" && "share" in navigator && (
                      <button type="button" className="btn btn-secondary" onClick={nativeShare}>
                        More…
                      </button>
                    )}
                  </div>
                  {note && <p className="text-[13px] text-pos-text">{note}</p>}
                  <p className="text-[12px] text-muted">If the customer withdraws permission or you delete the comment, the link and picture stop working.</p>
                </>
              )}
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
