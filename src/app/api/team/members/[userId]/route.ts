import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { memberUpdateSchema, uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ userId: uuidSchema }).strict();

// Change a member's role. Hierarchy and "last owner" rules are enforced in the database.
export const PATCH = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof memberUpdateSchema>>(
  { auth: "user", action: "team:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: memberUpdateSchema, maxBodyBytes: 1024 },
  async ({ supabase, membership, user, params, body, ipHash }) => {
    const { error } = await supabase.rpc("update_member", {
      p_account: membership.accountId,
      p_user: params.userId,
      p_role: body.role,
      p_agent_name: body.role === "agent" ? (body.agentName ?? null) : null,
    });
    if (error) throw dbError(error);
    await audit({
      accountId: membership.accountId,
      userId: user.id,
      action: "team.role_changed",
      targetType: "user",
      targetId: params.userId,
      metadata: { role: body.role },
      ipHash,
    });
    return ok({ updated: true });
  },
);

export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "team:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash, requestId }) => {
    if (params.userId === user.id) return fail("bad_request", "Use “Leave this business” to remove yourself.", undefined, requestId);
    const { error } = await supabase.rpc("remove_member", { p_account: membership.accountId, p_user: params.userId });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "team.removed", targetType: "user", targetId: params.userId, ipHash });
    return ok({ removed: true });
  },
);
