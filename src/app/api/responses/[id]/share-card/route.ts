import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";
import { planAllows, upgradeMessage } from "@/lib/billing/features";
import { loadShareCard, shareCardUrls } from "@/lib/share/card";

const params = z.object({ id: uuidSchema }).strict();

// Make a social media share card for one happy comment. Owners and admins (same right as showing it on
// the website). Paid plans. Only comments the customer agreed to share: checked here and on every view.
export const POST = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash, requestId }) => {
    const { data: acct, error } = await supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle();
    if (error) throw dbError(error);
    if (!planAllows(acct?.plan as string | undefined, "social")) return fail("forbidden", upgradeMessage("social"), undefined, requestId);
    // The user's own client: row rules make sure the comment belongs to this business.
    const { data: own } = await supabase.from("responses").select("id").eq("id", params.id).eq("account_id", membership.accountId).maybeSingle();
    if (!own) return fail("not_found", undefined, undefined, requestId);
    const card = await loadShareCard(params.id);
    if (!card || card.accountId !== membership.accountId) {
      return fail("conflict", "Only happy comments the customer agreed to share can be shared.", undefined, requestId);
    }
    const urls = shareCardUrls(params.id);
    await audit({ accountId: membership.accountId, userId: user.id, action: "testimonial.share_card", targetType: "response", targetId: params.id, ipHash });
    return ok({ page: urls.page, image: urls.image, square: urls.square, text: `What our customers say about ${card.businessName}:` });
  },
);
