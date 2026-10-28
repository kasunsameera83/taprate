import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { helpdeskCreateSchema, type HelpdeskCreateInput } from "@/lib/validation/schemas";
import { checkIntegrationUrl } from "@/lib/security/urlSafety";
import { helpdeskBaseUrl, helpdeskCredential } from "@/lib/helpdesk";
import { seal } from "@/lib/security/secretBox";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

const MAX_INTEGRATIONS = 20;

// Connect Zendesk or Freshdesk. We build the address ourselves from the subdomain (so it can only ever be
// <name>.zendesk.com / <name>.freshdesk.com), and store the address and credentials encrypted.
// Nobody can read the token back after saving.
export const POST = secureRoute<undefined, undefined, HelpdeskCreateInput>(
  { auth: "user", action: "integrations:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: helpdeskCreateSchema, maxBodyBytes: 2048 },
  async ({ membership, user, body, ipHash, requestId }) => {
    const base = helpdeskBaseUrl(body.kind, body.subdomain);
    const check = checkIntegrationUrl(body.kind, base);
    if (!check.ok) return fail("validation_failed", undefined, { subdomain: check.reason }, requestId);

    const db = adminClient();
    const { count } = await db.from("integrations").select("id", { count: "exact", head: true }).eq("account_id", membership.accountId);
    if ((count ?? 0) >= MAX_INTEGRATIONS) return fail("conflict", `You can have up to ${MAX_INTEGRATIONS} integrations.`, undefined, requestId);

    const master = env().RESPONSE_TOKEN_SECRET;
    const credential =
      body.kind === "zendesk" ? helpdeskCredential({ kind: "zendesk", email: body.email, apiToken: body.apiToken }) : helpdeskCredential({ kind: "freshdesk", apiKey: body.apiKey });
    const { data, error } = await db
      .from("integrations")
      .insert({
        account_id: membership.accountId,
        kind: body.kind,
        name: body.name,
        url_encrypted: seal(master, base),
        url_hint: check.url.hostname,
        secret_encrypted: seal(master, credential),
        events: [...new Set(body.events)],
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw dbError(error);

    await audit({ accountId: membership.accountId, userId: user.id, action: "integration.created", targetType: "integration", targetId: data.id, metadata: { kind: body.kind }, ipHash });
    return ok({ id: data.id }, 201);
  },
);
