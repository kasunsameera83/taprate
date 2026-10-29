import { secureRoute, ok } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { resendConfirmSchema, type ResendConfirmInput } from "@/lib/validation/schemas";
import { sha256Hex } from "@/lib/security/request";
import { userClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// "Didn't get the email? Send it again." Same answer whether or not the address has an account (no
// account enumeration), and quiet limits per IP and per address so it can't be used to flood an inbox.
export const POST = secureRoute<undefined, undefined, ResendConfirmInput, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.resendPerIp, body: resendConfirmSchema, maxBodyBytes: 512 },
  async ({ body }) => {
    const answer = ok({ message: "If that address is waiting for confirmation, we've sent a new link." }, 202);
    // Over the per-address limit: answer the same, send nothing.
    if (!(await hitRateLimit(LIMITS.resendPerEmail, sha256Hex(body.email)))) return answer;
    const supabase = await userClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: body.email, options: { emailRedirectTo: `${env().appOrigin}/auth/callback` } });
    if (error && error.status !== 429) console.error("[auth] resend failed", { code: error.code, status: error.status });
    return answer;
  },
);
