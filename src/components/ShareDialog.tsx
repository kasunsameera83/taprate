"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaceLoader } from "@/components/FaceLoader";

export type ShareCardData = { page: string; image: string; square: string; text: string };

// A share window for a picture card: preview, WhatsApp/Facebook/LinkedIn/X, an Instagram-size download,
// copy link, and the phone's own share menu. `load` asks the server to make the card (it decides if allowed).
export function ShareDialog({
  open,
  onClose,
  title,
  subtitle,
  load,
  fileName,
  footnote,
  loadingLabel = "Making your card",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  load: () => Promise<{ ok: true; data: ShareCardData } | { ok: false; message: string }>;
  fileName: string;
  footnote?: string;
  loadingLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [card, setCard] = useState<ShareCardData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [mounted, setMounted] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    ref.current?.showModal();
    setBusy(true);
    setErr("");
    setNote("");
    setCard(null);
    loadRef.current().then((r) => {
      setBusy(false);
      if (r.ok) setCard(r.data);
      else setErr(r.message);
    });
  }, [open]);

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
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function nativeShare() {
    if (!card) return;
    try {
      const blob = await (await fetch(card.square)).blob();
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${card.text} ${card.page}` });
      else await navigator.share({ text: card.text, url: card.page });
    } catch {
      /* cancelled */
    }
  }

  if (!mounted || !open) return null;
  return createPortal(
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-auto rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        {busy && (
          <div className="py-6">
            <FaceLoader label={loadingLabel} />
          </div>
        )}
        {err && <p className="text-sm font-medium text-neg-text">{err}</p>}
        {card && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.image}
              alt="Preview of the picture to share"
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
                  try {
                    await navigator.clipboard.writeText(card.page);
                    setNote("Link copied.");
                  } catch {
                    setNote(card.page);
                  }
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
            {note && <p className="break-all text-[13px] text-pos-text">{note}</p>}
            {footnote && <p className="text-[12px] text-muted">{footnote}</p>}
          </>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
