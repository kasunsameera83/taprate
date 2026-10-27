import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { mfaConfirmSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

// Step 2: the first code from the app proves it was set up correctly; the factor becomes active.
export const POST = secureRoute<undefined, undefined, z.infer<typeof mfaConfirmSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, body: mfaConfirmSchema, maxBodyBytes: 512 },
  async ({ supabase, user, membership, body, ipHash, requestId }) => {
    if (!(await hitRateLimit(LIMITS.mfaVerify, user.id))) return fail("rate_limited", "Too many attempts. Wait a few minutes and try again.", undefined, requestId);

    // The factor must belong to this user and still be unverified.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.all?.find((f) => f.id === body.factorId && f.status !== "verified");
    if (!factor) return fail("not_found", "Start again: that setup has expired.", undefined, requestId);

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: body.factorId, code: body.code });
    if (error) return fail("validation_failed", undefined, { code: "That code didn't work. Try the newest code in your app." }, requestId);

    await audit({ accountId: membership?.accountId ?? null, userId: user.id, action: "auth.mfa_enabled", ipHash });
    return ok({ enabled: true });
  },
);
