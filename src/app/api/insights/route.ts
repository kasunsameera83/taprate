import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { insightCreateSchema, insightsQuerySchema } from "@/lib/validation/schemas";
import { env } from "@/lib/env";
import { generateInsight, MIN_COMMENTS } from "@/lib/insights/generate";
import { audit } from "@/lib/audit";

export const maxDuration = 60;

// Saved summaries (owners, admins, viewers; the database applies the same rule).
export const GET = secureRoute<undefined, z.infer<typeof insightsQuerySchema>>(
  { auth: "user", action: "insights:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: insightsQuerySchema },
  async ({ supabase, membership, query }) => {
    let q = supabase
      .from("insights")
      .select("id, survey_id, period_days, period_start, period_end, comment_count, rating_count, result, created_at, surveys(name)")
      .eq("account_id", membership.accountId);
    q = query.surveyId ? q.eq("survey_id", query.surveyId) : q;
    const [{ data, error }, { data: acct }] = await Promise.all([
      q.order("created_at", { ascending: false }).limit(10),
      supabase.from("accounts").select("ai_insights_enabled").eq("id", membership.accountId).maybeSingle(),
    ]);
    if (error) throw dbError(error);
    return ok({
      enabled: Boolean(acct?.ai_insights_enabled),
      configured: Boolean(env().ANTHROPIC_API_KEY),
      items: (data ?? []).map((i) => ({
        id: i.id,
        surveyId: i.survey_id,
        surveyName: (i.surveys as unknown as { name: string } | null)?.name ?? null,
        days: i.period_days,
        periodStart: i.period_start,
        periodEnd: i.period_end,
        commentCount: i.comment_count,
        ratingCount: i.rating_count,
        result: i.result,
        createdAt: i.created_at,
      })),
    });
  },
);

// Make a new summary. Owners/admins; only when the business has switched AI on; rate limited (cost).
export const POST = secureRoute<undefined, undefined, z.infer<typeof insightCreateSchema>>(
  { auth: "user", action: "insights:generate", ipLimit: LIMITS.userWrite, userLimit: LIMITS.aiPerUser, body: insightCreateSchema, maxBodyBytes: 256 },
  async ({ supabase, membership, user, body, ipHash, requestId }) => {
    let surveyName: string | null = null;
    if (body.surveyId) {
      const { data: s } = await supabase.from("surveys").select("name").eq("id", body.surveyId).eq("account_id", membership.accountId).maybeSingle();
      if (!s) return fail("not_found", undefined, undefined, requestId);
      surveyName = s.name;
    }
    const r = await generateInsight(supabase, { accountId: membership.accountId, surveyId: body.surveyId ?? null, surveyName, days: body.days, userId: user.id });
    if (!r.ok) {
      const messages: Record<typeof r.code, [Parameters<typeof fail>[0], string]> = {
        not_configured: ["unavailable", "AI summaries aren't set up yet."],
        disabled: ["forbidden", "An owner needs to turn on AI summaries first."],
        too_few: ["conflict", `There are only ${r.count ?? 0} comments in this period. A summary needs at least ${MIN_COMMENTS}.`],
        rate_limited: ["rate_limited", "You've made a lot of summaries today. Try again tomorrow."],
        busy: ["unavailable", "The AI service is busy. Try again in a minute."],
        failed: ["unavailable", "Couldn't make the summary. Please try again."],
      };
      const [code, message] = messages[r.code];
      return fail(code, message, undefined, requestId);
    }
    await audit({ accountId: membership.accountId, userId: user.id, action: "insights.generated", targetType: "insight", targetId: r.id, metadata: { days: body.days, comments: r.period.comments.length }, ipHash });
    return ok({ id: r.id, createdAt: r.createdAt, result: r.result, commentCount: r.period.totalComments, ratingCount: r.period.stats.total, sampled: r.period.comments.length < r.period.totalComments }, 201);
  },
);
