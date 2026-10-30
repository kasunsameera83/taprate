// What each plan can use. Plans differ mainly by volume; the free plan (and a new, unpaid business)
// gets the core product but not the extras below. The database enforces the same rules
// (migration 0031: private.plan_allows / plan limits), so this file is for the UI and early, friendly checks.

export type Feature = "integrations" | "api" | "tv" | "ai" | "reports" | "repeats" | "social" | "replies" | "white_label" | "own_domain" | "custom_domain";

export const PAID_PLANS = ["starter", "growth", "scale"] as const;
export const isPaidPlan = (plan: string | null | undefined): boolean => (PAID_PLANS as readonly string[]).includes(plan ?? "");

/** Features and the cheapest plan that has them. Keep in step with private.plan_allows (0031). */
export type Tier = "starter" | "growth" | "scale";
export const FEATURE_PLAN: Record<Feature, Tier> = {
  integrations: "starter",
  api: "starter",
  tv: "starter",
  ai: "starter",
  reports: "starter",
  repeats: "starter",
  social: "starter",
  replies: "starter",
  white_label: "growth",
  own_domain: "scale",
  custom_domain: "scale",
};

export const FEATURE_NAME: Record<Feature, string> = {
  integrations: "Helpdesk, Shopify, Slack and webhook connections",
  api: "The API",
  tv: "Office TV screens",
  ai: "AI reply drafts and insights",
  reports: "Weekly and monthly email reports",
  repeats: "Repeat sends",
  social: "Social media share cards",
  replies: "Replying to customers from TapTruly",
  white_label: "Removing the TapTruly name from your surveys",
  own_domain: "Emails from your own domain",
  custom_domain: "Survey pages on your own web address",
};

const RANK: Record<string, number> = { starter: 1, growth: 2, scale: 3 };

export function planAllows(plan: string | null | undefined, feature: Feature): boolean {
  return (RANK[plan ?? ""] ?? 0) >= RANK[FEATURE_PLAN[feature]]!;
}

/** Whether to show "Feedback by TapTruly" on a business's survey pages and emails. */
export function showBranding(plan: string | null | undefined, hideBranding: boolean | null | undefined): boolean {
  return !(hideBranding && planAllows(plan, "white_label"));
}

/** Team members (including pending invites) and locations a business can have. Keep in step with 0031. */
export function planLimits(plan: string | null | undefined): { members: number; locations: number } {
  return isPaidPlan(plan) ? { members: 1000, locations: 1000 } : { members: 2, locations: 1 };
}

/** The message shown when a free business tries a paid feature. */
export const upgradeMessage = (feature: Feature) =>
  `${FEATURE_NAME[feature]}: available on ${FEATURE_PLAN[feature] === "scale" ? "the Scale plan" : FEATURE_PLAN[feature] === "growth" ? "the Growth and Scale plans" : "paid plans"}. Choose a plan in Settings → Billing.`;
