import { randomBytes } from "node:crypto";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { integrationCreateSchema, type IntegrationCreateInput } from "@/lib/validation/schemas";
import { checkIntegrationUrl } from "@/lib/security/urlSafety";
import { seal } from "@/lib/security/secretBox";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

const MAX_INTEGRATIONS = 20;

export const GET = secureRoute(
  { auth: "user", action: "integrations:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    // RLS: owners/admins only; the encrypted URL and secret columns aren't even selectable.
    const { data, error } = await supabase
      .from("integrations")
      .select("id, kind, name, url_hint, events, enabled, created_at, last_status, last_delivery_at")
      .eq("account_id", membership.accountId)
      .order("created_at", { ascending: true });
    if (error) throw dbError(error);
    return ok(
      (data ?? []).map((i) => ({
        id: i.id as string,
        kind: i.kind as string,
        name: i.name as string,
        urlHint: i.url_hint as string,
        events: i.events as string[],
        enabled: i.enabled as boolean,
        createdAt: i.created_at as string,
        lastStatus: (i.last_status as string | null) ?? null,
        lastDeliveryAt: (i.last_delivery_at as string | null) ?? null,
      })),
    );
  },
);

// Add Slack / Teams / webhook. The URL is checked (https, public host, right provider) and stored encrypted.
// Webhooks get a signing secret, shown once, so the receiver can verify requests really come from TapRate.
export const POST = secureRoute<undefined, undefined, IntegrationCreateInput>(
  { auth: "user", action: "integrations:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: integrationCreateSchema, maxBodyBytes: 2048 },
  async ({ membership, user, body, ipHash, requestId }) => {
    const check = checkIntegrationUrl(body.kind, body.url);
    if (!check.ok) return fail("validation_failed", undefined, { url: check.reason }, requestId);

    const db = adminClient();
    const { count } = await db.from("integrations").select("id", { count: "exact", head: true }).eq("account_id", membership.accountId);
    if ((count ?? 0) >= MAX_INTEGRATIONS) return fail("conflict", `You can have up to ${MAX_INTEGRATIONS} integrations.`, undefined, requestId);

    const master = env().RESPONSE_TOKEN_SECRET;
    const signingSecret = body.kind === "webhook" ? `whsec_${randomBytes(24).toString("base64url")}` : null;
    const { data, error } = await db
      .from("integrations")
      .insert({
        account_id: membership.accountId,
        kind: body.kind,
        name: body.name,
        url_encrypted: seal(master, check.url.toString()),
        url_hint: check.hint,
        secret_encrypted: signingSecret ? seal(master, signingSecret) : null,
        events: [...new Set(body.events)],
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw dbError(error);

    await audit({ accountId: membership.accountId, userId: user.id, action: "integration.created", targetType: "integration", targetId: data.id, metadata: { kind: body.kind }, ipHash });
    return ok({ id: data.id, signingSecret }, 201);
  },
);
