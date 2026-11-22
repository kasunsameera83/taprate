import type { User } from "@supabase/supabase-js";

// "Continue with Google" helpers. Pure functions (unit tested); the routes do the I/O.

/** Short-lived httpOnly cookie that carries a referral code from the start of Google sign-in to the callback. */
export const GOOGLE_REF_COOKIE = "tt_google_ref";
export const GOOGLE_REF_TTL_SEC = 600;
export const REF_CODE = /^[A-Z2-9]{8}$/;

/** True for someone who has just created their account with Google and hasn't been set up by us yet. */
export function isNewGoogleUser(user: Pick<User, "created_at" | "app_metadata" | "user_metadata">, now = Date.now()): boolean {
  const provider = (user.app_metadata as { provider?: unknown } | undefined)?.provider;
  const created = Date.parse(user.created_at ?? "");
  const meta = (user.user_metadata ?? {}) as { terms_version?: unknown };
  return provider === "google" && Number.isFinite(created) && now - created < 15 * 60 * 1000 && !meta.terms_version;
}

/** True when the user can sign in with Google (used to explain why a password check failed). */
export function usesGoogle(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  const meta = (user?.app_metadata ?? {}) as { provider?: unknown; providers?: unknown };
  return meta.provider === "google" || (Array.isArray(meta.providers) && meta.providers.includes("google"));
}

/** The message for a wrong password: Google users may never have set one. */
export function wrongPasswordMessage(user: Pick<User, "app_metadata"> | null | undefined): string {
  return usesGoogle(user)
    ? "That password is incorrect. If you sign in with Google and never set a password, use “Forgot password?” on the sign-in page to create one."
    : "That password is incorrect";
}

/** Only accept Google's sign-in page as the place we send people to. */
export function isSafeOAuthUrl(url: string, supabaseUrl: string): boolean {
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    return u.protocol === base.protocol && u.host === base.host && u.pathname.startsWith("/auth/v1/authorize");
  } catch {
    return false;
  }
}
