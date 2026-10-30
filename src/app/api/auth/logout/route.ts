import { secureRoute, ok } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { signedInHintCookie } from "@/lib/site/signedInHint";
import { userClient } from "@/lib/supabase/server";

// Public so an expired session can still log out cleanly; still CSRF-checked (POST only).
export const POST = secureRoute<undefined, undefined, undefined, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.publicPerIp },
  async () => {
    const supabase = await userClient();
    await supabase.auth.signOut({ scope: "local" });
    const res = ok({ signedOut: true });
    const hint = signedInHintCookie(false);
    res.cookies.set(hint.name, hint.value, hint.options);
    return res;
  },
);
