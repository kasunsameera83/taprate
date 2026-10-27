import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";

/**
 * Re-checks the signed-in user's password before a sensitive action (change email/password, delete account).
 * Uses a separate, cookie-less client so the user's real session is untouched, then revokes the test session.
 * Rate limited per user to stop password guessing through this path.
 */
export async function verifyPassword(userId: string, email: string | undefined, password: string): Promise<"ok" | "wrong" | "limited"> {
  if (!email) return "wrong";
  if (!(await hitRateLimit(LIMITS.reauth, userId))) return "limited";
  const e = env();
  const probe = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({ email, password });
  if (error || !data.user || data.user.id !== userId) return "wrong";
  await probe.auth.signOut({ scope: "local" });
  return "ok";
}
