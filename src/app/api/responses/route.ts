import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { responsesQuerySchema, type ResponsesQuery } from "@/lib/validation/schemas";
import { RESPONSE_COLUMNS, toResponseDto, type ResponseRow } from "@/lib/responses/query";

export const GET = secureRoute<undefined, ResponsesQuery>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: responsesQuerySchema },
  async ({ supabase, membership, query }) => {
    const fromRow = (query.page - 1) * query.limit;

    let q = supabase
      .from("responses")
      .select(RESPONSE_COLUMNS, { count: "exact" })
      .eq("account_id", membership.accountId)
      .eq("status", query.status);
    if (query.surveyId) q = q.eq("survey_id", query.surveyId);
    if (query.rating !== undefined) q = q.eq(query.status === "confirmed" ? "rating" : "pending_rating", query.rating);
    if (query.agent) q = q.eq("agent", query.agent);
    if (query.from) q = q.gte("created_at", `${query.from}T00:00:00Z`);
    if (query.to) q = q.lte("created_at", `${query.to}T23:59:59.999Z`);

    const { data, error, count } = await q.order("created_at", { ascending: false }).range(fromRow, fromRow + query.limit - 1);
    if (error) throw dbError(error);

    return ok({
      items: (data as unknown as ResponseRow[]).map(toResponseDto),
      page: query.page,
      limit: query.limit,
      total: count ?? 0,
    });
  },
);
