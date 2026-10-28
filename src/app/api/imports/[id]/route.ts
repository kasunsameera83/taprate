import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Undo an import: removes exactly the ratings it added. The database checks role and account.
export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "responses:import", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash }) => {
    const { data, error } = await supabase.rpc("delete_import", { p_batch: params.id });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "import.deleted", targetType: "import", targetId: params.id, metadata: { rows: Number(data ?? 0) }, ipHash });
    return ok({ removed: Number(data ?? 0) });
  },
);
