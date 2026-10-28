import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { uuidSchema } from "@/lib/validation/schemas";
import { adminCreditsSchema } from "@/lib/validation/admin";

const params = z.object({ id: uuidSchema }).strict();

// Add or remove responses for a business (goodwill, corrections). Reason required; logged twice
// (credit_adjustments, visible to the business owner, and the platform log).
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof adminCreditsSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: adminCreditsSchema, maxBodyBytes: 2048 },
  async ({ supabase, user, params, body, ipHash }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.rpc("admin_adjust_credits", { p_account: params.id, p_amount: body.amount, p_reason: body.reason });
    if (error) throw dbError(error);
    await adminAudit({ adminId: user.id, action: "business.credits_adjusted", targetType: "account", targetId: params.id, metadata: { amount: body.amount, reason: body.reason }, ipHash });
    return ok({ balance: Number(data) });
  },
);
