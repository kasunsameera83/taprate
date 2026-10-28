import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { promoPreviewSchema } from "@/lib/validation/schemas";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { quote } from "@/lib/billing/catalog";
import { applyPromo } from "@/lib/billing/promo";
import { loadPromo } from "@/lib/billing/server";
import { z } from "zod";

// "What does this code do?" Shows the price of every plan and pack with the code applied, so the page can
// show it. It's only a preview: checkout checks the code again. Rate limited per business (and per user)
// so codes can't be guessed.
export const POST = secureRoute<undefined, undefined, z.infer<typeof promoPreviewSchema>>(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userWrite, userLimit: LIMITS.checkoutPerUser, body: promoPreviewSchema, maxBodyBytes: 256 },
  async ({ membership, body, requestId }) => {
    if (!(await hitRateLimit(LIMITS.promoPerAccount, membership.accountId))) return fail("rate_limited", "Too many tries. Please wait a while and try again.", undefined, requestId);
    const [{ promo, usage }, catalog] = await Promise.all([loadPromo(body.code, membership.accountId), loadCatalog()]);
    const items = [...catalog.plans.filter((p) => p.active).map((p) => p.id), ...catalog.packs.filter((k) => k.active).map((k) => k.id)];
    const prices: Record<string, { amountMinor: number; listAmountMinor: number; bonusCredits: number }> = {};
    let firstError: string | null = null;
    let summary = "";
    for (const item of items) {
      const q = quote(catalog, item, item.startsWith("pack_") ? null : body.interval, body.provider);
      if (!q) continue;
      const r = applyPromo(promo, q, usage);
      if (r.ok) {
        prices[item] = { amountMinor: r.quote.amountMinor, listAmountMinor: r.quote.listAmountMinor, bonusCredits: r.quote.bonusCredits };
        summary ||= r.summary;
      } else firstError ||= r.reason;
    }
    if (Object.keys(prices).length === 0) return fail("validation_failed", firstError ?? "That code isn't valid.", { code: firstError ?? "That code isn't valid." }, requestId);
    return ok({ code: body.code, description: promo?.description ?? "", summary, prices });
  },
);
