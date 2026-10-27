import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { changeEmailSchema } from "@/lib/validation/schemas";
import { verifyPassword } from "@/lib/reauth";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

// Changing the sign-in email needs the current password. Supabase then emails a confirmation link;
// the change only happens once it's clicked (turn on "Secure email change" in Supabase to confirm both addresses).
export const POST = secureRoute<undefined, undefined, z.infer<typeof changeEmailSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.dangerous, body: changeEmailSchema, maxBodyBytes: 1024 },
  async ({ supabase, user, membership, body, ipHash, requestId }) => {
    if (body.email === user.email?.toLowerCase()) return fail("validation_failed", undefined, { email: "That's already your email" }, requestId);
    const check = await verifyPassword(user.id, user.email, body.currentPassword);
    if (check === "limited") return fail("rate_limited", undefined, undefined, requestId);
    if (check === "wrong") return fail("validation_failed", undefined, { currentPassword: "That password is incorrect" }, requestId);

    const { error } = await supabase.auth.updateUser({ email: body.email }, { emailRedirectTo: `${env().appOrigin}/auth/callback` });
    if (error) {
      if (error.code === "email_exists") return fail("validation_failed", undefined, { email: "That email can't be used. Try another." }, requestId);
      console.error("[email-change] failed", { code: error.code });
      return fail("unavailable", undefined, undefined, requestId);
    }
    await audit({ accountId: membership?.accountId ?? null, userId: user.id, action: "auth.email_change_requested", ipHash });
    return ok({ message: `We sent a confirmation link to ${body.email}. Your email changes when you click it.` });
  },
);
