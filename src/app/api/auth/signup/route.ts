import { secureRoute, ok, ApiError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { signUpSchema, type SignUpInput } from "@/lib/validation/schemas";
import { userClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export const POST = secureRoute<undefined, undefined, SignUpInput, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.signupPerIp, body: signUpSchema },
  async ({ body, ipHash }) => {
    const supabase = await userClient();
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        emailRedirectTo: `${env().appOrigin}/auth/callback`,
        data: { account_name: body.accountName },
      },
    });

    if (error) {
      // Weak/leaked password rules from Supabase are safe to show; everything else is generic.
      if (error.code === "weak_password") throw new ApiError("validation_failed", undefined, { password: "Choose a stronger password" });
      if (error.status === 429) throw new ApiError("rate_limited");
      console.error("[signup] supabase error", { code: error.code, status: error.status });
    }

    if (data?.user) await audit({ accountId: null, userId: data.user.id, action: "auth.signup", ipHash });

    // Same answer whether or not the email already has an account (no account enumeration).
    return ok({ message: "Check your email to confirm your account." }, 202);
  },
);
