import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { assertPlatformAdmin } from "@/lib/admin";
import { uuidSchema } from "@/lib/validation/schemas";

const params = z.object({ id: uuidSchema }).strict();

export const GET = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params },
  async ({ supabase, params }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.rpc("admin_account_detail", { p_account: params.id });
    if (error) throw dbError(error);
    return ok(data);
  },
);
