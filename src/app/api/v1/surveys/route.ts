import { z } from "zod";
import { apiRoute } from "@/lib/security/apiRoute";
import { ok, dbError } from "@/lib/security/route";
import { apiSurveysQuerySchema } from "@/lib/validation/schemas";
import { toApiSurvey } from "@/lib/api/v1";

// GET /api/v1/surveys — the business's surveys (archived ones are left out).
export const GET = apiRoute<undefined, z.infer<typeof apiSurveysQuerySchema>>({ scope: "read", query: apiSurveysQuerySchema }, async ({ db, key, query }) => {
  let q = db.from("surveys").select("id, name, question, icon_set, status, created_at").eq("account_id", key.accountId);
  q = query.status === "all" ? q.neq("status", "archived") : q.eq("status", query.status);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) throw dbError(error);
  return ok((data ?? []).map(toApiSurvey));
});
