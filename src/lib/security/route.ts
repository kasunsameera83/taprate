import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import { env } from "@/lib/env";
import { userClient } from "@/lib/supabase/server";
import { canPerform, type Action } from "@/lib/security/authz";
import { resolveMembership, mfaState, ACCOUNT_COOKIE, type Membership } from "@/lib/account";
import { hitRateLimit, type RateLimitRule } from "@/lib/security/rateLimit";
import { getClientIp, hashIp, isJsonRequest, isSameOriginRequest } from "@/lib/security/request";
import { fieldErrors } from "@/lib/validation/schemas";

// ---------------------------------------------------------------------------
// Responses. Errors never include stack traces, SQL messages or internal ids.
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "validation_failed"
  | "rate_limited"
  | "mfa_required"
  | "unavailable"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  validation_failed: 422,
  rate_limited: 429,
  mfa_required: 401,
  unavailable: 503,
  internal_error: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  bad_request: "The request could not be processed.",
  unauthorized: "Please sign in.",
  forbidden: "You don't have permission to do that.",
  not_found: "Not found.",
  conflict: "That change conflicts with existing data.",
  payload_too_large: "The request is too large.",
  unsupported_media_type: "Send the request as JSON.",
  validation_failed: "Some fields need attention.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  mfa_required: "Enter the code from your authenticator app to continue.",
  unavailable: "The service is busy. Please try again shortly.",
  internal_error: "Something went wrong. Please try again.",
};

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
  }
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(code: ErrorCode, message?: string, fields?: Record<string, string>, requestId?: string): NextResponse {
  const res = NextResponse.json(
    { ok: false, error: { code, message: message ?? DEFAULT_MESSAGE[code], ...(fields ? { fields } : {}), ...(requestId ? { requestId } : {}) } },
    { status: STATUS[code], headers: { "Cache-Control": "no-store" } },
  );
  if (code === "rate_limited") res.headers.set("Retry-After", "60");
  return res;
}

// ---------------------------------------------------------------------------
// The secure route wrapper. EVERY API route goes through this, in this order:
//   1. same-origin (CSRF) check for writes
//   2. IP rate limit
//   3. content-type + body size checks, safe JSON parse
//   4. authentication (token verified with Supabase, not just decoded)
//   4b. two-factor: users with an authenticator must have completed the second step
//   5. membership (active account, re-checked every request) + authorization
//   6. per-user rate limit
//   7. validation of route params, query string and body (strict schemas)
//   8. the handler
// Any thrown error becomes a safe, generic response; details are logged server-side only.
// ---------------------------------------------------------------------------

type Schema<T> = ZodType<T>;

export type { Membership };

/**
 * "user"      signed in AND a member of a business account (most routes)
 * "user-any"  signed in, may have no account yet (invites, creating an account, own security settings)
 * "public"    no sign-in (login, sign-up, customer survey endpoints)
 */
type AuthMode = "user" | "user-any" | "public";

export type Ctx<P, Q, B, A extends AuthMode> = {
  req: NextRequest;
  params: P;
  query: Q;
  body: B;
  ip: string;
  ipHash: string;
  requestId: string;
} & (A extends "user"
  ? { user: User; membership: Membership; supabase: SupabaseClient }
  : A extends "user-any"
    ? { user: User; membership: Membership | null; supabase: SupabaseClient }
    : { user: null; membership: null; supabase: null });

type Config<P, Q, B, A extends AuthMode> = {
  auth: A;
  /** Required for "user" routes: the permission this route needs. */
  action: A extends "user" ? Action : null;
  ipLimit: RateLimitRule;
  userLimit?: A extends "public" ? never : RateLimitRule;
  /** Only for the second-step endpoints themselves (verifying the 2FA code, signing out). */
  allowWithoutSecondFactor?: boolean;
  params?: Schema<P>;
  query?: Schema<Q>;
  body?: Schema<B>;
  /** Max JSON body size in bytes (default 16 KB). */
  maxBodyBytes?: number;
};

type RouteContext = { params: Promise<Record<string, string | string[]>> };

export function secureRoute<P = undefined, Q = undefined, B = undefined, A extends AuthMode = "user">(
  config: Config<P, Q, B, A>,
  handler: (ctx: Ctx<P, Q, B, A>) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx: RouteContext): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const e = env();

      // 1. CSRF
      if (!isSameOriginRequest(req.method, req.headers, e.appOrigin)) {
        return fail("forbidden", "Cross-site request blocked.", undefined, requestId);
      }

      // 2. IP rate limit (before anything expensive; also protects login and public endpoints)
      const ip = getClientIp(req.headers);
      const ipHash = hashIp(e.IP_HASH_SALT, ip);
      if (!(await hitRateLimit(config.ipLimit, ipHash))) return fail("rate_limited", undefined, undefined, requestId);

      // 3. Body: JSON only, size-limited, parsed safely
      let rawBody: unknown = undefined;
      if (config.body) {
        if (!isJsonRequest(req.headers)) return fail("unsupported_media_type", undefined, undefined, requestId);
        const max = config.maxBodyBytes ?? 16 * 1024;
        const declared = Number(req.headers.get("content-length") ?? "0");
        if (declared > max) return fail("payload_too_large", undefined, undefined, requestId);
        const text = await req.text();
        if (Buffer.byteLength(text, "utf8") > max) return fail("payload_too_large", undefined, undefined, requestId);
        try {
          rawBody = text.length ? JSON.parse(text) : undefined;
        } catch {
          return fail("bad_request", "Invalid JSON.", undefined, requestId);
        }
        if (rawBody === null || typeof rawBody !== "object" || Array.isArray(rawBody)) {
          return fail("bad_request", "Expected a JSON object.", undefined, requestId);
        }
      }

      // 4-6. Authentication, membership, authorization, per-user limit
      let user: User | null = null;
      let membership: Membership | null = null;
      let supabase: SupabaseClient | null = null;

      if (config.auth !== "public") {
        supabase = await userClient();
        const { data, error } = await supabase.auth.getUser(); // verifies the session with Supabase
        if (error || !data.user) return fail("unauthorized", undefined, undefined, requestId);
        const authedUser: User = data.user;
        user = authedUser;

        // Two-factor: the database also refuses data to such sessions; this gives a clear answer.
        if (!config.allowWithoutSecondFactor) {
          const mfa = await mfaState(supabase);
          if (mfa.needsCode) return fail("mfa_required", undefined, undefined, requestId);
        }

        // Active account comes from a cookie but is never trusted: it must match a real membership.
        membership = await resolveMembership(supabase, authedUser.id, req.cookies.get(ACCOUNT_COOKIE)?.value);
        if (config.auth === "user") {
          if (!membership) return fail("forbidden", "You're not part of a business account yet.", undefined, requestId);
          if (!config.action || !canPerform(membership.role, config.action)) {
            return fail("forbidden", undefined, undefined, requestId);
          }
        }
        if (config.userLimit && !(await hitRateLimit(config.userLimit, authedUser.id))) {
          return fail("rate_limited", undefined, undefined, requestId);
        }
      }

      // 7. Validation
      let params: unknown = undefined;
      if (config.params) {
        const p = config.params.safeParse(await routeCtx.params);
        if (!p.success) return fail("not_found", undefined, undefined, requestId); // don't reveal why
        params = p.data;
      }

      let query: unknown = undefined;
      if (config.query) {
        const sp = req.nextUrl.searchParams;
        const obj: Record<string, string> = {};
        for (const key of new Set(sp.keys())) {
          const values = sp.getAll(key);
          if (values.length > 1) return fail("validation_failed", undefined, { [key]: "Given more than once" }, requestId);
          obj[key] = values[0] ?? "";
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

      // 8. Handler
      // The checks above guarantee the shape promised by the auth mode, so this cast is safe.
      return await handler({ req, params, query, body, ip, ipHash, requestId, user, membership, supabase } as unknown as Ctx<P, Q, B, A>);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message, err.fields, requestId);
      console.error("[api] unhandled error", { requestId, path: req.nextUrl.pathname, err });
      return fail("internal_error", undefined, undefined, requestId);
    }
  };
}

/** Turn a Supabase/Postgres error into a safe ApiError (never leaks SQL details). */
// Messages raised by our own database functions that are safe and useful to show.
const DB_MESSAGES: Array<[RegExp, ErrorCode, string]> = [
  [/already a member/, "conflict", "That person is already on your team."],
  [/an account needs at least one owner/, "conflict", "Every account needs at least one owner. Make someone else an owner first."],
  [/only owners can invite admins/, "forbidden", "Only owners can invite admins."],
  [/you already own an account/, "conflict", "You already own a business account."],
  [/invite is no longer valid/, "conflict", "This invite has expired or was cancelled. Ask for a new one."],
  [/invite not found/, "not_found", "Invite not found."],
  [/too many pending invites/, "conflict", "You have too many pending invites. Cancel some first."],
  [/agent name required/, "validation_failed", "Enter the agent's name exactly as your helpdesk shows it."],
  [/invalid email/, "validation_failed", "Enter a valid email address."],
  [/assignee must be a team member/, "validation_failed", "Choose someone on your team."],
  [/no follow-up for this response/, "conflict", "This rating doesn't have a follow-up."],
  [/invalid due date/, "validation_failed", "Choose a due date within the next year."],
  [/too many notes/, "conflict", "This follow-up has reached the note limit."],
  [/invalid driver/, "validation_failed", "Pick reasons from the list."],
  [/invalid import (row|date)/, "validation_failed", "Some rows in the file aren't valid. Check the dates, ratings and emails."],
  [/survey is archived/, "conflict", "This survey is archived."],
  [/too many api keys/, "conflict", "You have 25 active keys. Revoke some first."],
  [/daily send limit reached/, "rate_limited", "You've reached today's email limit. The rest can go out tomorrow (or upgrade your plan for a higher limit)."],
  [/survey is not active/, "conflict", "This survey is paused. Turn it back on to send it."],
  [/business is suspended/, "forbidden", "Sending is turned off for this business. Please contact support."],
  [/invalid recipients?/, "validation_failed", "Some of those email addresses aren't valid."],
  [/only manual sends repeat/, "conflict", "Only sends you made yourself can repeat."],
  [/invalid repeat/, "validation_failed", "Choose every 1, 2 or 3 months."],
  [/not shareable/, "conflict", "Only comments a happy customer agreed to share can be shown on your website."],
  [/too many featured/, "conflict", "You can show up to 50 testimonials. Hide some first."],
  [/too many screens/, "conflict", "You can have up to 20 TV screens. Switch some off first."],
  [/language not available/, "forbidden", "Sinhala and Tamil aren't switched on for this business. Contact support to turn them on."],
  [/invalid location name/, "validation_failed", "Branch names can be up to 60 characters, without < or >."],
  [/invalid location/, "validation_failed", "Choose one of your branches."],
  [/too many locations/, "conflict", "You can have up to 200 branches. Archive some first."],
  [/locations_name_unique/, "conflict", "You already have a branch with that name."],
];

export function dbError(error: { code?: string; message?: string } | null): ApiError {
  for (const [pattern, code, message] of DB_MESSAGES) {
    if (error?.message && pattern.test(error.message)) return new ApiError(code, message);
  }
  if (error?.code === "23505") return new ApiError("conflict");
  if (error?.code === "23514") return new ApiError("validation_failed", "Some of those values aren't allowed. Check the form and try again.");
  if (error?.code === "PGRST116") return new ApiError("not_found");
  if (error?.code === "42501") return new ApiError("forbidden");
  if (error?.message?.includes("icon_set cannot change")) {
    return new ApiError("conflict", "The rating scale can't be changed after responses have been collected.");
  }
  console.error("[db] error", { code: error?.code });
  return new ApiError("internal_error");
}
