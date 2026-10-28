import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { reportSettingSchema } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

// Your own email report setting for the current business. Owners, admins and viewers (agents see only
// their own ratings, so business-wide reports aren't for them).
export const GET = secureRoute(
  { auth: "user", action: "insights:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership, user }) => {
    const { data, error } = await supabase
      .from("report_subscriptions")
      .select("frequency, survey_id, include_ai, last_sent_at")
      .eq("account_id", membership.accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw dbError(error);
    return ok({ frequency: data?.frequency ?? "off", surveyId: data?.survey_id ?? null, includeAi: data?.include_ai ?? false, lastSentAt: data?.last_sent_at ?? null, email: user.email ?? null });
  },
);

export const PUT = secureRoute<undefined, undefined, z.infer<typeof reportSettingSchema>>(
  { auth: "user", action: "insights:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: reportSettingSchema, maxBodyBytes: 256 },
  async ({ supabase, membership, user, body, ipHash, requestId }) => {
    const db = adminClient();
    if (body.frequency === "off") {
      const { error } = await db.from("report_subscriptions").delete().eq("account_id", membership.accountId).eq("user_id", user.id);
      if (error) throw dbError(error);
    } else {
      if (body.surveyId) {
        // The survey must belong to this business (read with the user's own permissions).
        const { data: s } = await supabase.from("surveys").select("id").eq("id", body.surveyId).eq("account_id", membership.accountId).maybeSingle();
        if (!s) return fail("validation_failed", undefined, { surveyId: "Choose one of your surveys" }, requestId);
      }
      const { error } = await db
        .from("report_subscriptions")
        .upsert({ account_id: membership.accountId, user_id: user.id, frequency: body.frequency, survey_id: body.surveyId ?? null, include_ai: body.includeAi ?? false }, { onConflict: "account_id,user_id" });
      if (error) throw dbError(error);
    }
    await audit({ accountId: membership.accountId, userId: user.id, action: "reports.updated", metadata: { frequency: body.frequency }, ipHash });
    return ok({ saved: true });
  },
);
