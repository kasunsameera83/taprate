import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { uuidSchema } from "@/lib/validation/schemas";
import { adminSuspendSchema } from "@/lib/validation/admin";

const params = z.object({ id: uuidSchema }).strict();

// Suspend (stop collecting ratings) or restore a business.
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof adminSuspendSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: adminSuspendSchema, maxBodyBytes: 2048 },
  async ({ supabase, user, params, body, ipHash }) => {
    await assertPlatformAdmin(supabase);
    const { error } = await supabase.rpc("admin_set_suspended", { p_account: params.id, p_suspend: body.suspend, p_reason: body.reason ?? null });
    if (error) throw dbError(error);
    await adminAudit({ adminId: user.id, action: body.suspend ? "business.suspended" : "business.restored", targetType: "account", targetId: params.id, metadata: { reason: body.reason ?? null }, ipHash });
    return ok({ suspended: body.suspend });
  },
);
