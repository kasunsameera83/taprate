"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { nudgeSnoozed, upgradeNudgeKey, upgradeNudgeText } from "@/lib/billing/nudge";

/** Shown on the free plan / trial after the 10th rating. "Not now" hides it for 14 days on this device. */
export function UpgradeCard({ accountId, offer }: { accountId: string; offer: { ratings: number; planName: string; price: string } }) {
  // Hidden until storage is checked, so a snoozed card never flashes.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(upgradeNudgeKey(accountId));
    } catch {
      /* storage blocked: just show it */
    }
    setHidden(nudgeSnoozed(stored));
  }, [accountId]);
  if (hidden) return null;

  const t = upgradeNudgeText(offer.ratings, { name: offer.planName, price: offer.price });
  const snooze = () => {
    try {
      localStorage.setItem(upgradeNudgeKey(accountId), String(Date.now()));
    } catch {
      /* storage blocked: hide for this visit only */
    }
    setHidden(true);
  };
  return (
    <section aria-label="Upgrade" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-brand/30 bg-brand-soft px-5 py-4">
      <div className="min-w-0">
        <p className="font-semibold">🎉 {t.title}</p>
        <p className="mt-0.5 text-sm text-muted">{t.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/settings/billing#plans" className="btn btn-primary btn-sm">
          See plans
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={snooze}>
          Not now
        </button>
      </div>
    </section>
  );
}
