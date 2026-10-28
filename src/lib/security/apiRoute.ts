import "server-only";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { ApiError, fail } from "@/lib/security/route";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp, isJsonRequest } from "@/lib/security/request";
import { bearerToken, keyIsUsable, parseApiKey, secretMatches, type ApiScope } from "@/lib/security/apiKeys";
import { fieldErrors } from "@/lib/validation/schemas";

// ---------------------------------------------------------------------------
// The wrapper for the PUBLIC API (/api/v1/*). Every v1 route goes through this, in this order:
//   1. IP rate limit
//   2. API key from the Authorization header only (never the URL), format-checked
//   3. key looked up by id, secret compared in constant time, revoked/expired keys refused
//      (repeated bad keys from one IP get rate limited)
//   4. scope check (read / write)
//   5. per-key rate limit
//   6. JSON-only, size-limited body; strict validation of params, query and body
//   7. the handler, which gets the key's account id and MUST scope every query to it
// No cookies are read here, so there is nothing for cross-site request forgery to ride on, and no CORS
// headers are sent, so browsers can't call the API from other sites. It is for server-to-server use.
// ---------------------------------------------------------------------------

export type ApiKeyCtx = { id: string; accountId: string; scopes: ApiScope[] };

export type ApiCtx<P, Q, B> = {
  req: NextRequest;
  params: P;
  query: Q;
  body: B;
  key: ApiKeyCtx;
  /** Service-role client: RLS does not apply, so always filter by key.accountId. */
  db: SupabaseClient;
  ipHash: string;
  requestId: string;
};

type Config<P, Q, B> = {
  scope: ApiScope;
  params?: ZodType<P>;
  query?: ZodType<Q>;
  body?: ZodType<B>;
  maxBodyBytes?: number;
};

type RouteContext = { params: Promise<Record<string, string | string[]>> };

function unauthorized(requestId: string, message = "Missing or invalid API key. Send it as: Authorization: Bearer tr_…") {
  const res = fail("unauthorized", message, undefined, requestId);
  res.headers.set("WWW-Authenticate", 'Bearer realm="TapRate API"');
  return res;
}

export function apiRoute<P = undefined, Q = undefined, B = undefined>(config: Config<P, Q, B>, handler: (ctx: ApiCtx<P, Q, B>) => Promise<Response>) {
  return async (req: NextRequest, routeCtx: RouteContext): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const e = env();
      const ipHash = hashIp(e.IP_HASH_SALT, getClientIp(req.headers));
      if (!(await hitRateLimit(LIMITS.apiPerIp, ipHash))) return fail("rate_limited", undefined, undefined, requestId);

      // Keys in query strings leak into logs and browser history: refuse them outright.
      if (req.nextUrl.searchParams.has("api_key") || req.nextUrl.searchParams.has("key") || req.nextUrl.searchParams.has("token")) {
        return unauthorized(requestId, "Send the API key in the Authorization header, not in the URL. Revoke this key: it may now be in logs.");
      }

      const parsedKey = parseApiKey(bearerToken(req.headers.get("authorization")));
      const badKey = async () => ((await hitRateLimit(LIMITS.apiBadKeyPerIp, ipHash)) ? unauthorized(requestId) : fail("rate_limited", undefined, undefined, requestId));
      if (!parsedKey) return badKey();

      const db = adminClient();
      const { data: row, error } = await db
        .from("api_keys")
        .select("id, account_id, token_hash, scopes, revoked_at, expires_at, last_used_at")
        .eq("id", parsedKey.keyId)
        .maybeSingle();
      if (error) return fail("unavailable", undefined, undefined, requestId);
      // Compare even when the row is missing, so timing doesn't reveal which key ids exist.
      const matches = secretMatches(row?.token_hash ?? "0".repeat(64), parsedKey.secret);
      if (!row || !matches) return badKey();
      if (!keyIsUsable(row)) return unauthorized(requestId, "This API key has been revoked or has expired.");

      const scopes = (row.scopes as string[]).filter((s): s is ApiScope => s === "read" || s === "write");
      if (!scopes.includes(config.scope)) return fail("forbidden", `This API key doesn't have "${config.scope}" access.`, undefined, requestId);

      const keyLimit = config.scope === "write" ? LIMITS.apiWrite : LIMITS.apiRead;
      if (!(await hitRateLimit(keyLimit, row.id))) return fail("rate_limited", undefined, undefined, requestId);

      // Body
      let rawBody: unknown = undefined;
      if (config.body) {
        if (!isJsonRequest(req.headers)) return fail("unsupported_media_type", undefined, undefined, requestId);
        const max = config.maxBodyBytes ?? 8 * 1024;
        if (Number(req.headers.get("content-length") ?? "0") > max) return fail("payload_too_large", undefined, undefined, requestId);
        const text = await req.text();
        if (Buffer.byteLength(text, "utf8") > max) return fail("payload_too_large", undefined, undefined, requestId);
        try {
          rawBody = text.length ? JSON.parse(text) : {};
        } catch {
          return fail("bad_request", "Invalid JSON.", undefined, requestId);
        }
        if (rawBody === null || typeof rawBody !== "object" || Array.isArray(rawBody)) return fail("bad_request", "Expected a JSON object.", undefined, requestId);
      }

      let params: unknown = undefined;
      if (config.params) {
        const p = config.params.safeParse(await routeCtx.params);
        if (!p.success) return fail("not_found", undefined, undefined, requestId);
        params = p.data;
      }
      let query: unknown = undefined;
      if (config.query) {
        const obj: Record<string, string> = {};
        const sp = req.nextUrl.searchParams;
        for (const k of new Set(sp.keys())) {
          const all = sp.getAll(k);
          if (all.length > 1) return fail("validation_failed", undefined, { [k]: "Given more than once" }, requestId);
          obj[k] = all[0] ?? "";
        }
        const q = config.query.safeParse(obj);
        if (!q.success) return fail("validation_failed", undefined, fieldErrors(q.error), requestId);
        query = q.data;
      }
      let body: unknown = undefined;
      if (config.body) {
        const b = config.body.safeParse(rawBody);
        if (!b.success) return fail("validation_failed", undefined, fieldErrors(b.error), requestId);
        body = b.data;
      }

      // Record use (at most every 5 minutes, so busy keys don't write on every call).
      if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 5 * 60_000) {
        await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
      }

      return await handler({
        req,
        params: params as P,
        query: query as Q,
        body: body as B,
        key: { id: row.id, accountId: row.account_id, scopes },
        db,
        ipHash,
        requestId,
      });
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message, err.fields, requestId);
      console.error("[api-v1] unhandled error", { requestId, path: req.nextUrl.pathname, err });
      return fail("internal_error", undefined, undefined, requestId);
    }
  };
}
