import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { newPasswordSchema } from "@/lib/validation/schemas";
import { verifyPurposeToken } from "@/lib/security/signing";
import { verifyPassword } from "@/lib/reauth";
import { PW_RESET_COOKIE, PW_RESET_TTL } from "@/lib/passwordReset";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

// Set a new password. Proof of identity is EITHER the current password (signed in normally)
// OR a fresh reset link (signed cookie, 15 minutes). Users with 2FA must also have passed the code step.
export const POST = secureRoute<undefined, undefined, z.infer<typeof newPasswordSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.dangerous, body: newPasswordSchema, maxBodyBytes: 2048 },
  async ({ req, supabase, user, body, ipHash, requestId }) => {
    const viaReset = verifyPurposeToken(env().RESPONSE_TOKEN_SECRET, "password-reset", user.id, req.cookies.get(PW_RESET_COOKIE)?.value, PW_RESET_TTL);

    if (!viaReset) {
      if (!body.currentPassword) return fail("validation_failed", undefined, { currentPassword: "Enter your current password" }, requestId);
      const check = await verifyPassword(user.id, user.email, body.currentPassword);
      if (check === "limited") return fail("rate_limited", undefined, undefined, requestId);
      if (check === "wrong") return fail("validation_failed", undefined, { currentPassword: "That password is incorrect" }, requestId);
    }
    if (body.currentPassword && body.currentPassword === body.newPassword) {
      return fail("validation_failed", undefined, { newPassword: "Choose a password different from your current one" }, requestId);
    }

    const { error } = await supabase.auth.updateUser({ password: body.newPassword });
    if (error) {
      if (error.code === "weak_password") return fail("validation_failed", undefined, { newPassword: "Choose a stronger password" }, requestId);
      if (error.code === "same_password") return fail("validation_failed", undefined, { newPassword: "Choose a password different from your current one" }, requestId);
      console.error("[password] update failed", { code: error.code });
      return fail("unavailable", undefined, undefined, requestId);
    }

    // Anyone else signed in with the old password is signed out.
    await supabase.auth.signOut({ scope: "others" });
    await audit({ accountId: null, userId: user.id, action: viaReset ? "auth.password_reset" : "auth.password_changed", ipHash });

    const res = ok({ changed: true });
    res.cookies.set(PW_RESET_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return res;
  },
);
