import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { followupsQuerySchema } from "@/lib/validation/schemas";
import { RESPONSE_COLUMNS, toResponseDto, type ResponseRow } from "@/lib/responses/query";

const PAGE = 25;

// Follow-up list. Agents only ever get their own ratings back (Row Level Security).
export const GET = secureRoute<undefined, z.infer<typeof followupsQuerySchema>>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: followupsQuerySchema },
  async ({ supabase, membership, user, query }) => {
    const nowIso = new Date().toISOString();
    let q = supabase
      .from("responses")
      .select(`${RESPONSE_COLUMNS}, followup_notes(count)`, { count: "exact" })
      .eq("account_id", membership.accountId)
      .not("followup_status", "is", null);

    if (query.status === "active") q = q.in("followup_status", ["open", "in_progress"]);
    else if (query.status === "overdue") q = q.in("followup_status", ["open", "in_progress"]).lt("due_at", nowIso);
    else q = q.eq("followup_status", query.status);
    if (query.mine) q = q.eq("assignee", user.id);
    if (query.surveyId) q = q.eq("survey_id", query.surveyId);

    const from = (query.page - 1) * PAGE;
    const ordered = query.status === "resolved" ? q.order("resolved_at", { ascending: false }) : q.order("due_at", { ascending: true });
    const { data, error, count } = await ordered.range(from, from + PAGE - 1);
    if (error) throw dbError(error);

    // Counts for the tabs (same scope as the list).
    const scoped = () => {
      let b = supabase.from("responses").select("id", { count: "exact", head: true }).eq("account_id", membership.accountId);
      if (query.mine) b = b.eq("assignee", user.id);
      if (query.surveyId) b = b.eq("survey_id", query.surveyId);
      return b.in("followup_status", ["open", "in_progress"]);
    };
    const [{ count: active }, { count: overdue }] = await Promise.all([scoped(), scoped().lt("due_at", nowIso)]);

    return ok({
      page: query.page,
      pageSize: PAGE,
      total: count ?? 0,
      counts: { active: active ?? 0, overdue: overdue ?? 0 },
      items: (data as unknown as Array<ResponseRow & { followup_notes: Array<{ count: number }> }>).map((r) => ({
        ...toResponseDto(r),
        noteCount: r.followup_notes?.[0]?.count ?? 0,
      })),
    });
  },
);
