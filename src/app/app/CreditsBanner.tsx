"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { creditLevel } from "@/lib/billing/credits";
import { isPaidPlan } from "@/lib/billing/features";

// "Running low" (dashboard only, can be hidden for the day) and "out of responses" (every page, can't be
// hidden: ratings aren't being saved). Owners get a button to billing; admins are asked to tell the owner.
export function CreditsBanner({ plan, credits, allowance, isOwner }: { plan: string; credits: number; allowance: number; isOwner: boolean }) {
  const path = usePathname();
  const level = creditLevel(credits, allowance);
  const paid = isPaidPlan(plan);
  const key = `tt-low-hidden-${new Date().toISOString().slice(0, 10)}`;
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let h = false;
    try {
      h = sessionStorage.getItem(key) === "1";
    } catch {
      /* storage blocked: just show it */
    }
    setHidden(h);
  }, [key]);

  if (level === 0 || path.startsWith("/app/settings/billing")) return null;
  if (level === 1 && (path !== "/app" || hidden)) return null;

  const out = level === 2;
  const title = out ? "You’re out of responses" : `Only ${credits} response${credits === 1 ? "" : "s"} left`;
  const body = out
    ? "Customers can still tap, but new ratings and comments aren’t being saved."
    : paid
      ? "When they run out, new ratings won’t be saved. Add a top-up or move up a plan."
      : "When they run out, new ratings won’t be saved. A plan gives you fresh responses every month, plus AI insights, the TV screen and email reports.";
  const cta = paid ? (out ? "Add responses" : "Top up") : "Choose a plan";

  return (
    <div
      role={out ? "alert" : "status"}
      className={`mb-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border p-4 text-sm ${
        out ? "border-[#f0c5c5] bg-neg-soft" : "border-[#f3d9a8] bg-neu-soft"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${out ? "text-neg-text" : "text-neu-text"}`}>{title}</p>
        <p className="mt-0.5 text-ink">{isOwner ? body : `${body} Ask the business owner to ${paid ? "add more" : "choose a plan"}.`}</p>
      </div>
      {isOwner && (
        <Link href="/app/settings/billing" className="btn btn-primary btn-sm">
          {cta}
        </Link>
      )}
      {!out && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Hide for now"
          onClick={() => {
            setHidden(true);
            try {
              sessionStorage.setItem(key, "1");
            } catch {
              /* ignore */
            }
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
