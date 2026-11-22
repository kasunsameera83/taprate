import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { googleStartSchema } from "@/lib/validation/schemas";
import { userClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { GOOGLE_REF_COOKIE, GOOGLE_REF_TTL_SEC, isSafeOAuthUrl } from "@/lib/auth/google";
import type { z } from "zod";

// Start "Continue with Google". Runs on the server (CSRF-checked, rate limited) so the PKCE code verifier
// is stored in our own httpOnly cookie. Google sends the person back to /auth/callback, where the code is
// exchanged for a session. Returns the Google sign-in URL; the page then navigates there.
export const POST = secureRoute<undefined, undefined, z.infer<typeof googleStartSchema>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.loginPerIp, body: googleStartSchema, maxBodyBytes: 512 },
  async ({ body, requestId }) => {
    const e = env();
    if (e.NEXT_PUBLIC_GOOGLE_AUTH !== "true") return fail("not_found", "Google sign-in isn't available yet.", undefined, requestId);

    const supabase = await userClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${e.appOrigin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data?.url || !isSafeOAuthUrl(data.url, e.NEXT_PUBLIC_SUPABASE_URL)) {
      console.error("[google] could not start", { code: error?.code });
      return fail("unavailable", "Google sign-in isn't working right now. Try again, or use your email.", undefined, requestId);
    }

    const res = ok({ url: data.url });
    // A referral code to attach after the account exists (only a well-formed one; checked again later).
    res.cookies.set(GOOGLE_REF_COOKIE, body.ref ?? "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/auth/callback",
      maxAge: body.ref ? GOOGLE_REF_TTL_SEC : 0,
    });
    return res;
  },
);
