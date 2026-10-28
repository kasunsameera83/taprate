import { apiRoute } from "@/lib/security/apiRoute";
import { ok, fail, dbError } from "@/lib/security/route";
import { apiResponsesQuerySchema, type ApiResponsesQuery } from "@/lib/validation/schemas";
import { API_RESPONSE_COLUMNS, toApiResponse } from "@/lib/api/v1";
import { decodeCursor, encodeCursor } from "@/lib/api/cursor";

// GET /api/v1/responses — confirmed ratings, newest first, with cursor pagination.
export const GET = apiRoute<undefined, ApiResponsesQuery>({ scope: "read", query: apiResponsesQuerySchema }, async ({ db, key, query, requestId }) => {
  let q = db.from("responses").select(API_RESPONSE_COLUMNS).eq("account_id", key.accountId).eq("status", "confirmed");
  if (query.survey_id) q = q.eq("survey_id", query.survey_id);
  if (query.sentiment) q = q.eq("sentiment", query.sentiment);
  if (query.channel) q = q.eq("channel", query.channel);
  if (query.since) q = q.gte("created_at", new Date(query.since).toISOString());
  if (query.until) q = q.lte("created_at", new Date(query.until).toISOString());
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    if (!c) return fail("validation_failed", undefined, { cursor: "Invalid cursor" }, requestId);
    // Both parts were strictly validated (ISO timestamp, uuid) before going into the filter.
    const ts = new Date(c.createdAt).toISOString();
    q = q.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${c.id})`);
  }
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(query.limit + 1);
  if (error) throw dbError(error);
  const rows = (data ?? []) as unknown as Parameters<typeof toApiResponse>[0][];
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return ok({
    items: page.map(toApiResponse),
    next_cursor: rows.length > query.limit && last ? encodeCursor(new Date(last.created_at).toISOString(), last.id) : null,
  });
});
