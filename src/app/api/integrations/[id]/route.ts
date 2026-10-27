import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { integrationUpdateSchema, uuidSchema } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

export const PATCH = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof integrationUpdateSchema>>(
  { auth: "user", action: "integrations:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: integrationUpdateSchema, maxBodyBytes: 1024 },
  async ({ membership, user, params, body, ipHash, requestId }) => {
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.enabled !== undefined) update.enabled = body.enabled;
    if (body.events !== undefined) update.events = [...new Set(body.events)];
    // Service role, so every query is explicitly scoped to this account.
    const { data, error } = await adminClient().from("integrations").update(update).eq("id", params.id).eq("account_id", membership.accountId).select("id").maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    await audit({ accountId: membership.accountId, userId: user.id, action: "integration.updated", targetType: "integration", targetId: params.id, ipHash });
    return ok({ updated: true });
  },
);

export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "integrations:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ membership, user, params, ipHash, requestId }) => {
    const { data, error } = await adminClient().from("integrations").delete().eq("id", params.id).eq("account_id", membership.accountId).select("id").maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    await audit({ accountId: membership.accountId, userId: user.id, action: "integration.deleted", targetType: "integration", targetId: params.id, ipHash });
    return ok({ deleted: true });
  },
);
