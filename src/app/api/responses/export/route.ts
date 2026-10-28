import { z } from "zod";
import { secureRoute, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { exportQuerySchema } from "@/lib/validation/schemas";
import { RESPONSE_COLUMNS, toResponseDto, type ResponseRow } from "@/lib/responses/query";
import { toCsv } from "@/lib/security/csv";
import { ratingOption, isIconSetId } from "@/lib/surveys/iconSets";
import { audit } from "@/lib/audit";

const MAX_ROWS = 10_000;

export const GET = secureRoute<undefined, z.infer<typeof exportQuerySchema>>(
  { auth: "user", action: "response:export", ipLimit: LIMITS.userExport, userLimit: LIMITS.userExport, query: exportQuerySchema },
  async ({ supabase, membership, user, query, ipHash }) => {
    let q = supabase
      .from("responses")
      .select(RESPONSE_COLUMNS)
      .eq("account_id", membership.accountId)
      .eq("status", "confirmed");
    if (query.surveyId) q = q.eq("survey_id", query.surveyId);
    if (query.locationId) q = q.eq("location_id", query.locationId);
    if (query.from) q = q.gte("created_at", `${query.from}T00:00:00Z`);
    if (query.to) q = q.lte("created_at", `${query.to}T23:59:59.999Z`);

    const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS);
    if (error) throw dbError(error);

    const rows = (data as unknown as ResponseRow[]).map(toResponseDto).map((r) => ({
      ...r,
      ratingLabel: r.iconSet && isIconSetId(r.iconSet) && r.rating !== null ? ratingOption(r.iconSet, r.rating)?.label ?? "" : "",
      verified: r.verified ? "yes" : "no",
      branch: r.location?.name ?? "",
    }));

    const csv = toCsv(rows, [
      { key: "createdAt", header: "Date (UTC)" },
      { key: "surveyName", header: "Survey" },
      { key: "rating", header: "Rating" },
      { key: "ratingLabel", header: "Rating label" },
      { key: "comment", header: "Comment" },
      { key: "email", header: "Customer email" },
      { key: "agent", header: "Agent" },
      { key: "ticket", header: "Ticket" },
      { key: "branch", header: "Branch" },
      { key: "verified", header: "Details verified" },
    ]);

    await audit({
      accountId: membership.accountId,
      userId: user.id,
      action: "responses.export",
      metadata: { rows: rows.length, surveyId: query.surveyId ?? null },
      ipHash,
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="responses-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
