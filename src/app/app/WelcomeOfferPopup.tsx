"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { offerPopupKey, offerPopupStage, offerTimeLeft, type OfferPopupStage } from "@/lib/billing/offer";

type Offer = { code: string; label: string; endsAt: string };

/** New businesses (owners): tells them about the welcome offer once, and once more on its last day. */
export function WelcomeOfferPopup({ accountId }: { accountId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [stage, setStage] = useState<OfferPopupStage | null>(null);

  useEffect(() => {
    let live = true;
    api<{ offer: Offer | null }>("/api/billing/welcome-offer").then((r) => {
      if (!live || !r.ok || !r.data.offer) return;
      const o = r.data.offer;
      const key = offerPopupKey(accountId, o.code);
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(key);
      } catch {
        /* storage blocked: the banner on the billing page still shows it, so don't pop up every visit */
        return;
      }
      const s = offerPopupStage(stored, o.endsAt);
      if (!s) return;
      try {
        localStorage.setItem(key, s);
      } catch {
        return;
      }
      setOffer(o);
      setStage(s);
    });
    return () => {
      live = false;
    };
  }, [accountId]);

  useEffect(() => {
    if (offer && stage && !dialog.current?.open) dialog.current?.showModal();
  }, [offer, stage]);

  if (!offer || !stage) return null;
  const close = () => dialog.current?.close();
  return (
    <dialog
      ref={dialog}
      aria-labelledby="welcome-offer-title"
      className="m-auto w-[min(440px,calc(100%-2rem))] rounded-[var(--radius-panel)] bg-surface p-0 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.6)] backdrop:bg-[rgba(15,23,42,0.55)]"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="p-6 text-center">
        <p className="text-[40px] leading-none" aria-hidden>
          🎁
        </p>
        <h2 id="welcome-offer-title" className="mt-3 text-xl font-bold">
          {stage === "last" ? "Last day for your welcome offer" : "A welcome gift for you"}
        </h2>
        <p className="mt-2 text-[15px]">
          Get <strong>{offer.label}</strong> on any plan.
        </p>
        <p className="mt-1 text-sm font-semibold text-brand">{offerTimeLeft(offer.endsAt)}.</p>
        <p className="mt-2 text-[13px] text-muted">It&rsquo;s already applied on the billing page, no code needed. Nothing is charged automatically.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/app/settings/billing#plans" className="btn btn-primary" onClick={close}>
            See plans
          </Link>
          <button type="button" className="btn btn-ghost" onClick={close}>
            Maybe later
          </button>
        </div>
      </div>
    </dialog>
  );
}
