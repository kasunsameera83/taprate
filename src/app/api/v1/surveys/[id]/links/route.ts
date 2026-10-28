import { z } from "zod";
import { apiRoute } from "@/lib/security/apiRoute";
import { ok, fail, dbError } from "@/lib/security/route";
import { apiLinksSchema, uuidSchema, type ApiLinksInput } from "@/lib/validation/schemas";
import { buildLinkToken, signMetadata } from "@/lib/security/signing";
import { ICON_SETS, isIconSetId } from "@/lib/surveys/iconSets";
import { env } from "@/lib/env";

const params = z.object({ id: uuidSchema }).strict();

// POST /api/v1/surveys/{id}/links — one-tap rating links for ONE recipient, for your own emails.
// The recipient details are signed, so ratings from these links are marked "verified" and can't be
// edited by the customer to pretend to be someone else or another ticket.
export const POST = apiRoute<z.infer<typeof params>, undefined, ApiLinksInput>(
  { scope: "write", params, body: apiLinksSchema, maxBodyBytes: 2048 },
  async ({ db, key, params, body, requestId }) => {
    const { data: survey, error } = await db
      .from("surveys")
      .select("id, icon_set, status")
      .eq("id", params.id)
      .eq("account_id", key.accountId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!survey || !isIconSetId(survey.icon_set) || survey.status === "archived") return fail("not_found", undefined, undefined, requestId);
    if (survey.status !== "active") return fail("conflict", "This survey is paused. Turn it back on to collect ratings.", undefined, requestId);

    const e = env();
    const meta = { email: body.email ?? null, agent: body.agent ?? null, ticket: body.ticket ?? null };
    const sp = new URLSearchParams();
    if (meta.email) sp.set("e", meta.email);
    if (meta.agent) sp.set("a", meta.agent);
    if (meta.ticket) sp.set("t", meta.ticket);
    if (meta.email || meta.agent || meta.ticket) sp.set("s", signMetadata(e.LINK_SIGNING_SECRET, survey.id, meta));
    const qs = sp.toString();

    return ok(
      {
        survey_id: survey.id,
        links: ICON_SETS[survey.icon_set].options.map((o) => ({
          rating: o.value,
          label: o.label,
          url: `${e.appOrigin}/r/${buildLinkToken(e.LINK_SIGNING_SECRET, survey.id, o.value)}${qs ? `?${qs}` : ""}`,
        })),
      },
      201,
    );
  },
);
