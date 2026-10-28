import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { locationUpdateSchema, uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Rename or archive a branch. The database checks the branch belongs to a business where you're an owner or admin.
export const PATCH = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof locationUpdateSchema>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: locationUpdateSchema, maxBodyBytes: 512 },
  async ({ supabase, membership, user, params, body, ipHash }) => {
    const { error } = await supabase.rpc("update_location", { p_location: params.id, p_name: body.name, p_archived: body.archived });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: body.archived ? "location.archived" : "location.updated", targetType: "location", targetId: params.id, ipHash });
    return ok({ updated: true });
  },
);
