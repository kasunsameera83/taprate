import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { ACCOUNT_COOKIE } from "@/lib/account";
import { audit } from "@/lib/audit";

// Leave the active business. The database refuses if you're its last owner.
export const POST = secureRoute(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.dangerous },
  async ({ supabase, membership, user, ipHash }) => {
    const { error } = await supabase.rpc("remove_member", { p_account: membership.accountId, p_user: user.id });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "team.left", ipHash });
    const res = ok({ left: true });
    res.cookies.delete(ACCOUNT_COOKIE);
    return res;
  },
);
