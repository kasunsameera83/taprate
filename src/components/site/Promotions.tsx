"use client";
import { useEffect, useRef, useState } from "react";
import { THEMES, type PublicPromotion } from "@/lib/site/content";

// Seasonal greeting bar and promotion pop-up. Text only (rendered as text, never HTML). Each visitor
// sees a pop-up once; a closed greeting stays closed. Remembered in this browser only.
const seenKey = (id: string) => `tr-promo-${id}`;
const wasSeen = (id: string) => {
  try {
    return localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
};
const markSeen = (id: string) => {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {
    /* private mode: just show it again next time */
  }
};

export function GreetingBar({ promo, preview = false }: { promo: PublicPromotion; preview?: boolean }) {
  const [hidden, setHidden] = useState(!preview);
  useEffect(() => {
    if (!preview) setHidden(wasSeen(promo.id));
  }, [promo.id, preview]);
  if (hidden) return null;
  const theme = THEMES[promo.theme];
  return (
    <div role="region" aria-label="Greeting" className="text-white" style={{ backgroundImage: `linear-gradient(90deg, ${theme.from}, ${theme.to})` }}>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-2.5 text-sm">
        <span aria-hidden className="text-lg">
          {theme.emoji}
        </span>
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">{promo.title}</strong>
          {promo.body && <span className="opacity-90"> {promo.body}</span>}
          {promo.ctaLabel && promo.ctaUrl && (
            <a href={promo.ctaUrl} className="ml-2 font-semibold underline underline-offset-2" rel={promo.ctaUrl.startsWith("/") ? undefined : "noopener noreferrer"}>
              {promo.ctaLabel}
            </a>
          )}
        </p>
        <button
          type="button"
          aria-label="Close greeting"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
          onClick={() => {
            markSeen(promo.id);
            setHidden(true);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function PromoPopup({ promo, preview = false }: { promo: PublicPromotion; preview?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview || wasSeen(promo.id)) return;
    // A short delay so it doesn't jump at people before the page has loaded.
    const t = setTimeout(() => ref.current?.showModal(), 2500);
    return () => clearTimeout(t);
  }, [promo.id, preview]);
  const close = () => {
    markSeen(promo.id);
    ref.current?.close();
  };
  const theme = THEMES[promo.theme];
  const card = (
    <div className="overflow-hidden rounded-[var(--radius-panel)] bg-surface text-ink">
      <div className="flex h-24 items-center justify-center text-5xl" style={{ backgroundImage: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }} aria-hidden>
        {theme.emoji}
      </div>
      <div className="p-6 text-center">
        <h2 id={`promo-${promo.id}`} className="text-xl font-bold">
          {promo.title}
        </h2>
        {promo.body && <p className="mt-2 whitespace-pre-line text-sm text-muted">{promo.body}</p>}
        <div className="mt-5 flex flex-col gap-2">
          {promo.ctaLabel && promo.ctaUrl && (
            <a href={promo.ctaUrl} onClick={close} className="btn btn-primary" rel={promo.ctaUrl.startsWith("/") ? undefined : "noopener noreferrer"}>
              {promo.ctaLabel}
            </a>
          )}
          <button type="button" className="btn btn-ghost" onClick={close}>
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
  if (preview) return <div className="mx-auto w-full max-w-sm border border-line shadow-lg">{card}</div>;
  return (
    <dialog
      ref={ref}
      aria-labelledby={`promo-${promo.id}`}
      onCancel={() => markSeen(promo.id)}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] bg-transparent p-0 shadow-xl backdrop:bg-ink/50"
    >
      {card}
    </dialog>
  );
}
