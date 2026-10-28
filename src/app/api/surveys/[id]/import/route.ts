import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { importRowSchema, importSchema, uuidSchema, type ImportRow } from "@/lib/validation/schemas";
import { ICON_SETS, isIconSetId } from "@/lib/surveys/iconSets";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Import past ratings into a survey. The browser has already parsed and checked the file; here EVERY
// row is checked again (same schema + the survey's scale), and the database checks it all a third time.
// Imported ratings are history: they don't use credits, open follow-ups or send alerts.
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof importSchema>>(
  { auth: "user", action: "responses:import", ipLimit: LIMITS.userWrite, userLimit: LIMITS.importPerUser, params, body: importSchema, maxBodyBytes: 3 * 1024 * 1024 },
  async ({ supabase, membership, user, params, body, ipHash, requestId }) => {
    const { data: survey, error: sErr } = await supabase
      .from("surveys")
      .select("id, icon_set, status")
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .maybeSingle();
    if (sErr) throw dbError(sErr);
    if (!survey || !isIconSetId(survey.icon_set)) return fail("not_found", undefined, undefined, requestId);
    if (survey.status === "archived") return fail("conflict", "This survey is archived.", undefined, requestId);

    const scale = ICON_SETS[survey.icon_set];
    const rows: ImportRow[] = [];
    const problems: string[] = [];
    body.rows.forEach((raw, i) => {
      const r = importRowSchema.safeParse(raw);
      if (!r.success) problems.push(`Row ${i + 1}: ${r.error.issues[0]?.message ?? "invalid"}`);
      else if (r.data.rating < scale.min || r.data.rating > scale.max) problems.push(`Row ${i + 1}: rating outside ${scale.min}–${scale.max}`);
      else rows.push(r.data);
    });
    if (problems.length) return fail("validation_failed", `${problems.length} row(s) aren't valid. ${problems.slice(0, 3).join("; ")}`, undefined, requestId);

    const { data, error } = await supabase.rpc("import_responses", {
      p_account: membership.accountId,
      p_survey: survey.id,
      p_file_name: body.fileName,
      p_rows: rows,
    });
    if (error) {
      if (error.message?.includes("too many imports")) return fail("rate_limited", "You've imported a lot today. Try again tomorrow.", undefined, requestId);
      if (error.message?.includes("rating out of range")) return fail("validation_failed", `Ratings must be ${scale.min}–${scale.max} for this survey.`, undefined, requestId);
      throw dbError(error);
    }
    const result = data as { batch: string; inserted: number; skipped: number };
    await audit({ accountId: membership.accountId, userId: user.id, action: "import.created", targetType: "import", targetId: result.batch, metadata: { rows: result.inserted, skipped: result.skipped }, ipHash });
    return ok(result, 201);
  },
);
