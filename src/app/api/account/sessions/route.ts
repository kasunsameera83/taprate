import { signedInHintCookie } from "@/lib/site/signedInHint";
import { secureRoute, ok } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { audit } from "@/lib/audit";

// "Sign out everywhere": ends every session for this user on every device, including this one.
export const DELETE = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite },
  async ({ supabase, user, membership, ipHash }) => {
    await audit({ accountId: membership?.accountId ?? null, userId: user.id, action: "auth.signed_out_everywhere", ipHash });
    await supabase.auth.signOut({ scope: "global" });
    const res = ok({ signedOut: true });
    const hint = signedInHintCookie(false);
    res.cookies.set(hint.name, hint.value, hint.options);
    return res;
  },
);
