import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { env } from "@/lib/env";
import { loadProfile } from "@/lib/billing/server";
import { stripeApi } from "@/lib/billing/stripe";

// Stripe's own page for updating the card and downloading Stripe invoices. Owner only.
export const POST = secureRoute(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userWrite, userLimit: LIMITS.checkoutPerUser },
  async ({ membership, requestId }) => {
    const e = env();
    const profile = await loadProfile(membership.accountId);
    if (!e.STRIPE_SECRET_KEY || !profile?.stripe_customer_id) return fail("conflict", "There's no card on file with Stripe.", undefined, requestId);
    const r = await stripeApi<{ url: string }>(e.STRIPE_SECRET_KEY, "POST", "/v1/billing_portal/sessions", {
      customer: profile.stripe_customer_id,
      return_url: `${e.appOrigin}/app/settings/billing`,
    });
    if (!r.ok || !r.data.url.startsWith("https://billing.stripe.com/")) return fail("unavailable", "Couldn't open Stripe. Please try again.", undefined, requestId);
    return ok({ url: r.data.url });
  },
);
