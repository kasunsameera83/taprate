import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Switch a TV screen off: its link stops working straight away.
export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash }) => {
    const { error } = await supabase.rpc("revoke_tv_screen", { p_screen: params.id });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "tv.revoked", targetType: "tv_screen", targetId: params.id, ipHash });
    return ok({ revoked: true });
  },
);
