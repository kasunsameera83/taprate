import { z } from "zod";
import { secureRoute, ok } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { forgotPasswordSchema } from "@/lib/validation/schemas";
import { sha256Hex } from "@/lib/security/request";
import { userClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

const GENERIC = "If that email has an account, we've sent a link to reset the password. It expires in one hour.";

export const POST = secureRoute<undefined, undefined, z.infer<typeof forgotPasswordSchema>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.forgotPerIp, body: forgotPasswordSchema, maxBodyBytes: 1024 },
  async ({ body, ipHash }) => {
    // Per-email limit too, so nobody can flood one person's inbox. Same answer either way.
    if (await hitRateLimit(LIMITS.forgotPerEmail, sha256Hex(body.email))) {
      const supabase = await userClient();
      const { error } = await supabase.auth.resetPasswordForEmail(body.email, { redirectTo: `${env().appOrigin}/auth/recovery` });
      if (error) console.error("[forgot] supabase error", { status: error.status });
      await audit({ accountId: null, userId: null, action: "auth.password_reset_requested", metadata: { emailHash: sha256Hex(body.email) }, ipHash });
    }
    // Identical response whether or not the account exists (no account enumeration).
    return ok({ message: GENERIC }, 202);
  },
);
