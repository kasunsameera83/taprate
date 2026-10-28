import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";

const query = z.object({ surveyId: uuidSchema.optional() }).strict();

// Past imports (owners/admins; RLS enforces the same).
export const GET = secureRoute<undefined, z.infer<typeof query>>(
  { auth: "user", action: "responses:import", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query },
  async ({ supabase, membership, query }) => {
    let q = supabase
      .from("import_batches")
      .select("id, survey_id, file_name, row_count, skipped, created_at, surveys(name)")
      .eq("account_id", membership.accountId);
    if (query.surveyId) q = q.eq("survey_id", query.surveyId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (error) throw dbError(error);
    return ok(
      (data ?? []).map((b) => ({
        id: b.id as string,
        surveyId: b.survey_id as string,
        surveyName: ((b.surveys as unknown as { name: string } | null)?.name ?? "") as string,
        fileName: b.file_name as string,
        rows: b.row_count as number,
        skipped: b.skipped as number,
        createdAt: b.created_at as string,
      })),
    );
  },
);
