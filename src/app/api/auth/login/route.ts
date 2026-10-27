import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { signInSchema, type SignInInput } from "@/lib/validation/schemas";
import { sha256Hex } from "@/lib/security/request";
import { userClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export const POST = secureRoute<undefined, undefined, SignInInput, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.loginPerIp, body: signInSchema },
  async ({ body, ipHash, requestId }) => {
    // Second limit per IP + email: slows password guessing against one account.
    if (!(await hitRateLimit(LIMITS.loginPerIpEmail, `${ipHash}:${sha256Hex(body.email)}`))) {
      return fail("rate_limited", undefined, undefined, requestId);
    }

    const supabase = await userClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });

    if (error || !data.user) {
      await audit({ accountId: null, userId: null, action: "auth.login_failed", metadata: { emailHash: sha256Hex(body.email) }, ipHash });
      if (error?.code === "email_not_confirmed") {
        return fail("unauthorized", "Please confirm your email first, then sign in.", undefined, requestId);
      }
      // One message for "no such user" and "wrong password".
      return fail("unauthorized", "Email or password is incorrect.", undefined, requestId);
    }

    await audit({ accountId: null, userId: data.user.id, action: "auth.login", ipHash });
    return ok({ signedIn: true });
  },
);
