import { secureRoute, ok } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { welcomeOfferFor } from "@/lib/billing/server";

// The welcome offer this business can still use (for the dashboard pop-up), or null. Owners only, like
// the billing page. Nothing secret: the same code the billing page shows. Checked again at checkout.
export const GET = secureRoute(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ membership }) => ok({ offer: await welcomeOfferFor(membership.accountId).catch(() => null) }),
);
