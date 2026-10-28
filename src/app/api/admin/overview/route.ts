import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { assertPlatformAdmin } from "@/lib/admin";

// Business-level numbers for the product owner. The database function checks admin + 2FA again.
export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.rpc("admin_overview");
    if (error) throw dbError(error);
    return ok(data);
  },
);
