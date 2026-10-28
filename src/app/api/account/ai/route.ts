import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { aiSettingSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

// Switch AI summaries on or off for the business. Owner only (checked here and by the database).
export const PATCH = secureRoute<undefined, undefined, z.infer<typeof aiSettingSchema>>(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: aiSettingSchema, maxBodyBytes: 128 },
  async ({ supabase, membership, user, body, ipHash }) => {
    const { error } = await supabase.from("accounts").update({ ai_insights_enabled: body.enabled }).eq("id", membership.accountId);
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: body.enabled ? "insights.enabled" : "insights.disabled", ipHash });
    return ok({ enabled: body.enabled });
  },
);
