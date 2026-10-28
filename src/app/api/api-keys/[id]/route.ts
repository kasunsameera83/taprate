import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Revoke a key: it stops working immediately. The database checks the role and the account.
export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "apikeys:manage", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash }) => {
    const { error } = await supabase.rpc("revoke_api_key", { p_key: params.id });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "apikey.revoked", targetType: "api_key", targetId: params.id, ipHash });
    return ok({ revoked: true });
  },
);
