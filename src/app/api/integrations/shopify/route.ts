import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { shopifyCreateSchema, type ShopifyCreateInput } from "@/lib/validation/schemas";
import { seal } from "@/lib/security/secretBox";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

const MAX_INTEGRATIONS = 20;

// Connect a Shopify shop: after an order, the customer gets the chosen survey by email.
// The shop address and signing key are stored encrypted; the key can't be read back after saving.
// The answer includes the address to paste into Shopify's webhook settings.
export const POST = secureRoute<undefined, undefined, ShopifyCreateInput>(
  { auth: "user", action: "integrations:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: shopifyCreateSchema, maxBodyBytes: 2048 },
  async ({ supabase, membership, user, body, ipHash, requestId }) => {
    // The survey must be this business's (read with the user's own session; the database checks again).
    const { data: survey, error: sErr } = await supabase.from("surveys").select("id, status").eq("id", body.surveyId).eq("account_id", membership.accountId).maybeSingle();
    if (sErr) throw dbError(sErr);
    if (!survey) return fail("validation_failed", undefined, { surveyId: "Choose one of your surveys" }, requestId);

    const db = adminClient();
    const { count } = await db.from("integrations").select("id", { count: "exact", head: true }).eq("account_id", membership.accountId);
    if ((count ?? 0) >= MAX_INTEGRATIONS) return fail("conflict", `You can have up to ${MAX_INTEGRATIONS} integrations.`, undefined, requestId);

    const master = env().RESPONSE_TOKEN_SECRET;
    const { data, error } = await db
      .from("integrations")
      .insert({
        account_id: membership.accountId,
        kind: "shopify",
        name: body.name,
        url_encrypted: seal(master, body.shop),
        url_hint: body.shop,
        secret_encrypted: body.signingSecret ? seal(master, body.signingSecret) : null,
        events: ["all"],
        survey_id: body.surveyId,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw dbError(error);

    await audit({ accountId: membership.accountId, userId: user.id, action: "integration.created", targetType: "integration", targetId: data.id, metadata: { kind: "shopify" }, ipHash });
    return ok({ id: data.id, webhookUrl: `${env().appOrigin}/api/webhooks/shopify/${data.id}`, surveyActive: survey.status === "active" }, 201);
  },
);
