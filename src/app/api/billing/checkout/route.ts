import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/schemas";
import { billingProviders } from "@/lib/env";
import { PROVIDER_CURRENCY, isPayWayOn, payWays, quote } from "@/lib/billing/catalog";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { createOrder, liveSubscription, loadProfile, loadPromo, startPayhere, startStripe } from "@/lib/billing/server";
import { applyPromo } from "@/lib/billing/promo";
import { hitRateLimit } from "@/lib/security/rateLimit";
import { audit } from "@/lib/audit";

// Start a payment. The browser sends ONLY what to buy and how to pay; the price comes from the server's
// catalog and is stored on the order, and the payment notification must match it exactly.
// Nothing is granted here: credits and plans change only when the provider's signed notification arrives.
export const POST = secureRoute<undefined, undefined, CheckoutInput>(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userWrite, userLimit: LIMITS.checkoutPerUser, body: checkoutSchema, maxBodyBytes: 512 },
  async ({ membership, user, body, ipHash, requestId }) => {
    const currency = body.currency ?? PROVIDER_CURRENCY[body.provider];
    if (!isPayWayOn(payWays(billingProviders()), body.provider, currency)) return fail("unavailable", "That payment method isn't set up yet.", undefined, requestId);
    const listQuote = quote(await loadCatalog(), body.item, body.interval ?? null, body.provider, currency);
    if (!listQuote) return fail("validation_failed", "Choose a plan or pack.", undefined, requestId);

    // A promo code is checked again here (never trusted from the preview) and baked into the order amount.
    let q = listQuote;
    let promo: { promoId: string; listAmountMinor: number; bonusCredits: number } | undefined;
    if (body.promoCode) {
      if (!(await hitRateLimit(LIMITS.promoPerAccount, membership.accountId))) return fail("rate_limited", undefined, undefined, requestId);
      const { promo: p, usage } = await loadPromo(body.promoCode, membership.accountId);
      const applied = applyPromo(p, listQuote, usage);
      if (!applied.ok) return fail("validation_failed", applied.reason, { promoCode: applied.reason }, requestId);
      q = applied.quote;
      promo = { promoId: applied.quote.promoId, listAmountMinor: applied.quote.listAmountMinor, bonusCredits: applied.quote.bonusCredits };
    }

    const profile = await loadProfile(membership.accountId);
    if (!profile) return fail("conflict", "Add your billing details first.", undefined, requestId);
    if (q.kind === "plan") {
      const live = await liveSubscription(membership.accountId);
      if (live && live.status !== "cancelled") {
        return fail(
          "conflict",
          live.cancel_at_period_end
            ? "Your current plan is cancelled and runs until the end of its period. You can choose a new plan after that."
            : "You already have a plan. Cancel it first; you can choose a new plan once it ends.",
          undefined,
          requestId,
        );
      }
    }

    const orderId = await createOrder(membership.accountId, user.id, body.provider, q, promo);
    const start = body.provider === "payhere" ? await startPayhere(orderId, q, profile) : await startStripe(orderId, membership.accountId, q, profile);
    if (!start) return fail("unavailable", "Couldn't start the payment. Please try again.", undefined, requestId);
    await audit({ accountId: membership.accountId, userId: user.id, action: "billing.checkout_started", targetType: "order", targetId: orderId, metadata: { item: q.item, provider: body.provider, currency: q.currency }, ipHash });
    return ok({ orderId, ...start }, 201);
  },
);
