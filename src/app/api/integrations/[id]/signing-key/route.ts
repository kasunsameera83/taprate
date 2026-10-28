import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { shopifyKeySchema, uuidSchema } from "@/lib/validation/schemas";
import { seal } from "@/lib/security/secretBox";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Add or replace a Shopify connection's webhook signing key. Stored encrypted; never shown again.
export const PUT = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof shopifyKeySchema>>(
  { auth: "user", action: "integrations:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: shopifyKeySchema, maxBodyBytes: 512 },
  async ({ membership, user, params, body, ipHash, requestId }) => {
    const { data, error } = await adminClient()
      .from("integrations")
      .update({ secret_encrypted: seal(env().RESPONSE_TOKEN_SECRET, body.signingSecret) })
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .eq("kind", "shopify")
      .select("id")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    await audit({ accountId: membership.accountId, userId: user.id, action: "integration.key_changed", targetType: "integration", targetId: params.id, ipHash });
    return ok({ saved: true });
  },
);
