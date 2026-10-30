"use client";
import Link from "next/link";
import { createContext, useContext } from "react";
import { FEATURE_NAME, FEATURE_PLAN, planAllows, planLimits, type Feature } from "@/lib/billing/features";

// The business's plan, for showing what's included. Display only: the server and database enforce it.
const PlanCtx = createContext<string>("trial");

export function PlanProvider({ plan, children }: { plan: string; children: React.ReactNode }) {
  return <PlanCtx.Provider value={plan}>{children}</PlanCtx.Provider>;
}

export const usePlan = () => useContext(PlanCtx);
export const useAllows = (feature: Feature) => planAllows(useContext(PlanCtx), feature);
export const usePlanLimits = () => planLimits(useContext(PlanCtx));

function UpgradeBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-brand/30 bg-brand-soft px-4 py-3 text-sm">
      <p className="min-w-0 flex-1 text-ink">{children}</p>
      <Link href="/app/settings/billing" className="btn btn-primary btn-sm">
        See plans
      </Link>
    </div>
  );
}

/** Shown in place of a paid feature's controls (or above them) when the plan doesn't include it. */
export function PaidFeatureNotice({ feature }: { feature: Feature }) {
  if (useAllows(feature)) return null;
  return (
    <UpgradeBox>
      <strong>{FEATURE_NAME[feature]}</strong> {FEATURE_PLAN[feature] === "scale" ? "come with the Scale plan." : "come with any paid plan, from Starter."}
    </UpgradeBox>
  );
}

/** "Free plan: N of M used" when a free business reaches a limit. */
export function PlanLimitNotice({ what, used }: { what: "members" | "locations"; used: number }) {
  const limits = usePlanLimits();
  const max = limits[what];
  if (used < max || max >= 1000) return null;
  return (
    <UpgradeBox>
      The free plan includes {max} {what === "members" ? (max === 1 ? "team member" : "team members, including you") : max === 1 ? "location" : "locations"}. Choose a plan to add more.
    </UpgradeBox>
  );
}
