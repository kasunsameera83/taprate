import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { mfaCodeSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

// Turning two-factor off needs a fully verified session (enforced by the wrapper) AND a current code,
// so a stolen, already-open session can't quietly remove it.
export const POST = secureRoute<undefined, undefined, z.infer<typeof mfaCodeSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, body: mfaCodeSchema, maxBodyBytes: 512 },
  async ({ supabase, user, membership, body, ipHash, requestId }) => {
    if (!(await hitRateLimit(LIMITS.mfaVerify, user.id))) return fail("rate_limited", "Too many attempts. Wait a few minutes and try again.", undefined, requestId);

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.filter((f) => f.status === "verified") ?? [];
    if (verified.length === 0) return fail("conflict", "Two-factor sign-in is already off.", undefined, requestId);

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: verified[0]!.id, code: body.code });
    if (error) return fail("validation_failed", undefined, { code: "That code didn't work. Try the newest code in your app." }, requestId);

    for (const f of factors?.all ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id });
    await audit({ accountId: membership?.accountId ?? null, userId: user.id, action: "auth.mfa_disabled", ipHash });
    return ok({ enabled: false });
  },
);
