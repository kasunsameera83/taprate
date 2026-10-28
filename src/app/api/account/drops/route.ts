import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { aiSettingSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

// Read and switch the email when satisfaction drops sharply. Switching is owner only (checked here and by the database).
export const GET = secureRoute(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data, error } = await supabase.from("accounts").select("drop_alerts_enabled").eq("id", membership.accountId).maybeSingle();
    if (error) throw dbError(error);
    return ok({ enabled: Boolean(data?.drop_alerts_enabled) });
  },
);

export const PATCH = secureRoute<undefined, undefined, z.infer<typeof aiSettingSchema>>(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: aiSettingSchema, maxBodyBytes: 128 },
  async ({ supabase, membership, user, body, ipHash }) => {
    const { error } = await supabase.from("accounts").update({ drop_alerts_enabled: body.enabled }).eq("id", membership.accountId);
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: body.enabled ? "drops.enabled" : "drops.disabled", ipHash });
    return ok({ enabled: body.enabled });
  },
);
