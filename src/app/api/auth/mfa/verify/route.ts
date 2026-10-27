import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { mfaCodeSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

// Second sign-in step: checks the 6-digit code and upgrades the session to aal2.
export const POST = secureRoute<undefined, undefined, z.infer<typeof mfaCodeSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.loginPerIp, body: mfaCodeSchema, maxBodyBytes: 512, allowWithoutSecondFactor: true },
  async ({ supabase, user, body, ipHash, requestId }) => {
    if (!(await hitRateLimit(LIMITS.mfaVerify, user.id))) return fail("rate_limited", "Too many attempts. Wait a few minutes and try again.", undefined, requestId);

    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) return fail("unavailable", undefined, undefined, requestId);
    const factor = factors?.totp?.find((f) => f.status === "verified");
    if (!factor) return fail("bad_request", "Two-factor sign-in isn't set up for this account.", undefined, requestId);

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: body.code });
    if (error) {
      await audit({ accountId: null, userId: user.id, action: "auth.mfa_failed", ipHash });
      return fail("validation_failed", undefined, { code: "That code didn't work. Check the time on your phone and try the newest code." }, requestId);
    }
    await audit({ accountId: null, userId: user.id, action: "auth.mfa_verified", ipHash });
    return ok({ verified: true });
  },
);
