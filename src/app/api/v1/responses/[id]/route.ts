import { z } from "zod";
import { apiRoute } from "@/lib/security/apiRoute";
import { ok, fail, dbError } from "@/lib/security/route";
import { uuidSchema } from "@/lib/validation/schemas";
import { API_RESPONSE_COLUMNS, toApiResponse } from "@/lib/api/v1";

const params = z.object({ id: uuidSchema }).strict();

// GET /api/v1/responses/{id} — one confirmed rating of this business.
export const GET = apiRoute<z.infer<typeof params>>({ scope: "read", params }, async ({ db, key, params, requestId }) => {
  const { data, error } = await db
    .from("responses")
    .select(API_RESPONSE_COLUMNS)
    .eq("id", params.id)
    .eq("account_id", key.accountId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return fail("not_found", undefined, undefined, requestId);
  return ok(toApiResponse(data as unknown as Parameters<typeof toApiResponse>[0]));
});
