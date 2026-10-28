import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { apiKeyCreateSchema, type ApiKeyCreateInput } from "@/lib/validation/schemas";
import { apiKeyHint, formatApiKey, newApiKeySecret } from "@/lib/security/apiKeys";
import { verifyPassword } from "@/lib/reauth";
import { audit } from "@/lib/audit";

// API keys for the public API. Owners and admins only (checked here and again by the database).
export const GET = secureRoute(
  { auth: "user", action: "apikeys:manage", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    // RLS: owners/admins; the key hash column isn't selectable at all.
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, scopes, created_at, expires_at, revoked_at, last_used_at")
      .eq("account_id", membership.accountId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw dbError(error);
    return ok(
      (data ?? []).map((k) => ({
        id: k.id as string,
        name: k.name as string,
        hint: apiKeyHint(k.id as string),
        scopes: k.scopes as string[],
        createdAt: k.created_at as string,
        expiresAt: (k.expires_at as string | null) ?? null,
        revokedAt: (k.revoked_at as string | null) ?? null,
        lastUsedAt: (k.last_used_at as string | null) ?? null,
      })),
    );
  },
);

// Create a key. Needs the password again (a key is a long-lived credential). The key is shown ONCE;
// only a hash of its secret is stored.
export const POST = secureRoute<undefined, undefined, ApiKeyCreateInput>(
  { auth: "user", action: "apikeys:manage", ipLimit: LIMITS.userWrite, userLimit: LIMITS.apiKeysPerUser, body: apiKeyCreateSchema, maxBodyBytes: 1024 },
  async ({ supabase, membership, user, body, ipHash, requestId }) => {
    const check = await verifyPassword(user.id, user.email, body.password);
    if (check === "limited") return fail("rate_limited", undefined, undefined, requestId);
    if (check === "wrong") return fail("validation_failed", undefined, { password: "That password is incorrect" }, requestId);

    const { secret, hash } = newApiKeySecret();
    const scopes = body.access === "read_write" ? ["read", "write"] : ["read"];
    const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString() : null;
    const { data, error } = await supabase.rpc("create_api_key", {
      p_account: membership.accountId,
      p_name: body.name,
      p_scopes: scopes,
      p_token_hash: hash,
      p_expires_at: expiresAt,
    });
    if (error) {
      if (error.message?.includes("too many api keys")) return fail("conflict", "You have 25 active keys. Revoke some first.", undefined, requestId);
      throw dbError(error);
    }
    const id = data as string;
    await audit({ accountId: membership.accountId, userId: user.id, action: "apikey.created", targetType: "api_key", targetId: id, metadata: { scopes: scopes.join(",") }, ipHash });
    return ok({ id, key: formatApiKey(id, secret), hint: apiKeyHint(id) }, 201);
  },
);
