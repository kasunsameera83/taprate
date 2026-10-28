import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { liveSubscription } from "@/lib/billing/server";
import { payhereCancelSubscription } from "@/lib/billing/payhere";
import { stripeApi, periodEnd } from "@/lib/billing/stripe";
import { audit } from "@/lib/audit";

// Cancel the plan. It stays active until the end of the period already paid for, then the business
// moves to the free plan (credits already bought are kept).
export const POST = secureRoute(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userWrite, userLimit: LIMITS.dangerous },
  async ({ membership, user, ipHash, requestId }) => {
    const sub = await liveSubscription(membership.accountId);
    if (!sub || sub.status === "cancelled" || sub.cancel_at_period_end) return fail("conflict", "There's no active plan to cancel.", undefined, requestId);
    const e = env();
    const db = adminClient();

    if (sub.provider === "stripe") {
      if (!e.STRIPE_SECRET_KEY || !/^sub_[A-Za-z0-9]+$/.test(sub.provider_sub_id)) return fail("unavailable", undefined, undefined, requestId);
      const r = await stripeApi<{ current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } }>(
        e.STRIPE_SECRET_KEY,
        "POST",
        `/v1/subscriptions/${sub.provider_sub_id}`,
        { cancel_at_period_end: true },
      );
      if (!r.ok) return fail("unavailable", "Couldn't cancel with Stripe. Please try again.", undefined, requestId);
      await db.rpc("billing_subscription_update", { p_provider: "stripe", p_sub_ref: sub.provider_sub_id, p_status: "active", p_cancel_at_period_end: true, p_period_end: periodEnd(r.data) });
    } else {
      if (!e.PAYHERE_APP_ID || !e.PAYHERE_APP_SECRET) return fail("unavailable", "Cancelling PayHere plans isn't set up yet. Contact support.", undefined, requestId);
      const okCancel = await payhereCancelSubscription({ sandbox: e.PAYHERE_SANDBOX !== "false", appId: e.PAYHERE_APP_ID, appSecret: e.PAYHERE_APP_SECRET, subscriptionId: sub.provider_sub_id });
      if (!okCancel) return fail("unavailable", "Couldn't cancel with PayHere. Please try again or contact support.", undefined, requestId);
      // PayHere stops future charges now; we keep the plan until the paid period ends (see the billing cron).
      await db.rpc("billing_subscription_update", { p_provider: "payhere", p_sub_ref: sub.provider_sub_id, p_status: "cancelled", p_cancel_at_period_end: true, p_period_end: null });
    }
    await audit({ accountId: membership.accountId, userId: user.id, action: "billing.cancelled", targetType: "subscription", targetId: sub.id, ipHash });
    return ok({ cancelled: true });
  },
);
