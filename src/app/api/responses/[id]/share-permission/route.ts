import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { sharePermissionSchema, uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";
import { planAllows, upgradeMessage } from "@/lib/billing/features";

const params = z.object({ id: uuidSchema }).strict();

// An owner or admin confirms the customer agreed (outside TapTruly, e.g. on WhatsApp) to their happy comment
// being shared on social media, or takes that back. The database checks the role, the business and that it's
// a happy confirmed comment, and records who confirmed it and when. Paid plans (same as share cards).
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof sharePermissionSchema>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: sharePermissionSchema, maxBodyBytes: 128 },
  async ({ supabase, membership, user, params, body, ipHash, requestId }) => {
    if (body.allowed) {
      const { data: acct, error: aErr } = await supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle();
      if (aErr) throw dbError(aErr);
      if (!planAllows(acct?.plan as string | undefined, "social")) return fail("forbidden", upgradeMessage("social"), undefined, requestId);
    }
    // Own business only (row rules), before the database function checks it again.
    const { data: own } = await supabase.from("responses").select("id").eq("id", params.id).eq("account_id", membership.accountId).maybeSingle();
    if (!own) return fail("not_found", undefined, undefined, requestId);
    const { error } = await supabase.rpc("set_owner_share_permission", { p_response: params.id, p_allowed: body.allowed });
    if (error) {
      if (/not shareable/.test(error.message)) return fail("conflict", "Only happy comments can be shared.", undefined, requestId);
      throw dbError(error);
    }
    await audit({ accountId: membership.accountId, userId: user.id, action: body.allowed ? "testimonial.owner_permission" : "testimonial.owner_permission_removed", targetType: "response", targetId: params.id, ipHash });
    return ok({ allowed: body.allowed });
  },
);
