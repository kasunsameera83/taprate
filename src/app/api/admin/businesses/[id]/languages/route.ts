import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { uuidSchema } from "@/lib/validation/schemas";
import { adminLanguagesSchema } from "@/lib/validation/admin";

const params = z.object({ id: uuidSchema }).strict();

// Switch Sinhala and Tamil on or off for one business (the product owner only; checked again in the database).
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof adminLanguagesSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: adminLanguagesSchema, maxBodyBytes: 256 },
  async ({ supabase, user, params, body, ipHash }) => {
    await assertPlatformAdmin(supabase);
    const { error } = await supabase.rpc("admin_set_local_languages", { p_account: params.id, p_enabled: body.enabled });
    if (error) throw dbError(error);
    await adminAudit({ adminId: user.id, action: body.enabled ? "business.languages_on" : "business.languages_off", targetType: "account", targetId: params.id, ipHash });
    return ok({ enabled: body.enabled });
  },
);
