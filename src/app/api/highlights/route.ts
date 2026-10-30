import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { planAllows, upgradeMessage } from "@/lib/billing/features";
import { highlightsUrls, loadHighlights, monthKey } from "@/lib/share/highlights";
import { audit } from "@/lib/audit";

const body = z.object({ month: z.enum(["current", "previous"]) }).strict();

// A shareable "our month" picture: number of ratings, % happy and one kind comment a customer agreed to share.
// Owners and admins; paid plans (same as review share cards).
export const POST = secureRoute<undefined, undefined, z.infer<typeof body>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body, maxBodyBytes: 64 },
  async ({ supabase, membership, user, body: b, ipHash, requestId }) => {
    const { data: acct } = await supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle();
    if (!planAllows(acct?.plan as string | undefined, "social")) return fail("forbidden", upgradeMessage("social"), undefined, requestId);
    const month = monthKey(b.month);
    const h = await loadHighlights(membership.accountId, month);
    if (!h) return fail("conflict", "There are no ratings for that month yet.", undefined, requestId);
    const urls = highlightsUrls(membership.accountId, month);
    await audit({ accountId: membership.accountId, userId: user.id, action: "highlights.shared", metadata: { month }, ipHash });
    return ok({ page: urls.page, image: urls.image, square: urls.square, text: `${h.businessName} in ${h.monthLabel}: ${h.total} ratings, ${h.happyPct}% happy customers.` });
  },
);
