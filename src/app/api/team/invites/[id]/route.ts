import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "team:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash }) => {
    const { error } = await supabase.rpc("revoke_invite", { p_invite: params.id });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "team.invite_revoked", targetType: "invite", targetId: params.id, ipHash });
    return ok({ revoked: true });
  },
);
