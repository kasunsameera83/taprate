import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { surveyUpdateSchema, thresholdFits, uuidSchema, type SurveyUpdateInput } from "@/lib/validation/schemas";
import { SURVEY_COLUMNS, toSurveyColumns, toSurveyDto, type SurveyRow } from "@/lib/surveys/mapping";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();
type Params = z.infer<typeof params>;

export const GET = secureRoute<Params>(
  { auth: "user", action: "survey:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params },
  async ({ supabase, membership, params }) => {
    const { data, error } = await supabase
      .from("surveys")
      .select(SURVEY_COLUMNS)
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found"); // also what another account's survey looks like
    return ok(toSurveyDto(data as SurveyRow));
  },
);

export const PATCH = secureRoute<Params, undefined, SurveyUpdateInput>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: surveyUpdateSchema },
  async ({ supabase, membership, user, params, body, ipHash }) => {
    const { data: current, error: readErr } = await supabase
      .from("surveys")
      .select("id, icon_set, alert_threshold")
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .maybeSingle();
    if (readErr) throw dbError(readErr);
    if (!current) return fail("not_found");

    // Cross-field rule checked against the final state, not just the fields sent.
    const iconSet = body.iconSet ?? current.icon_set;
    const threshold = body.alertThreshold !== undefined ? body.alertThreshold : current.alert_threshold;
    if (!thresholdFits(iconSet, threshold)) {
      return fail("validation_failed", undefined, { alertThreshold: "Alert level must be within the rating scale" });
    }

    const { data, error } = await supabase
      .from("surveys")
      .update(toSurveyColumns(body))
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .select(SURVEY_COLUMNS)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found");

    await audit({
      accountId: membership.accountId,
      userId: user.id,
      action: "survey.update",
      targetType: "survey",
      targetId: params.id,
      metadata: { fields: Object.keys(body).join(",") },
      ipHash,
    });
    return ok(toSurveyDto(data as SurveyRow));
  },
);

// "Delete" archives: links in already-sent emails stop recording, but history is kept.
export const DELETE = secureRoute<Params>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash }) => {
    const { data, error } = await supabase
      .from("surveys")
      .update({ status: "archived" })
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .select("id")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found");
    await audit({ accountId: membership.accountId, userId: user.id, action: "survey.archive", targetType: "survey", targetId: params.id, ipHash });
    return ok({ archived: true });
  },
);
