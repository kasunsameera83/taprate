import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { surveyCreateSchema, type SurveyCreateInput } from "@/lib/validation/schemas";
import { SURVEY_COLUMNS, toSurveyColumns, toSurveyDto, type SurveyRow } from "@/lib/surveys/mapping";
import { audit } from "@/lib/audit";

const MAX_SURVEYS_PER_ACCOUNT = 100;

export const GET = secureRoute(
  { auth: "user", action: "survey:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data, error } = await supabase
      .from("surveys")
      .select(SURVEY_COLUMNS)
      .eq("account_id", membership.accountId) // explicit scope + RLS
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(MAX_SURVEYS_PER_ACCOUNT);
    if (error) throw dbError(error);
    return ok((data as SurveyRow[]).map(toSurveyDto));
  },
);

export const POST = secureRoute<undefined, undefined, SurveyCreateInput>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: surveyCreateSchema },
  async ({ supabase, membership, user, body, ipHash }) => {
    const { count, error: countErr } = await supabase
      .from("surveys")
      .select("id", { count: "exact", head: true })
      .eq("account_id", membership.accountId);
    if (countErr) throw dbError(countErr);
    if ((count ?? 0) >= MAX_SURVEYS_PER_ACCOUNT) {
      return fail("conflict", `You can have up to ${MAX_SURVEYS_PER_ACCOUNT} surveys.`);
    }

    const { data, error } = await supabase
      .from("surveys")
      .insert({ ...toSurveyColumns(body), account_id: membership.accountId, created_by: user.id })
      .select(SURVEY_COLUMNS)
      .single();
    if (error) throw dbError(error);

    const survey = toSurveyDto(data as SurveyRow);
    await audit({ accountId: membership.accountId, userId: user.id, action: "survey.create", targetType: "survey", targetId: survey.id, ipHash });
    return ok(survey, 201);
  },
);
