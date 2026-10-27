import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { ACCOUNT_COOKIE, accountCookieOptions } from "@/lib/account";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// The database checks the invite is for this user's confirmed email, still pending and not expired.
export const POST = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, user, params, ipHash }) => {
    const { data, error } = await supabase.rpc("accept_invite", { p_invite: params.id });
    if (error) throw dbError(error);
    const accountId = data as string;
    await audit({ accountId, userId: user.id, action: "team.joined", targetType: "invite", targetId: params.id, ipHash });
    const res = ok({ accountId });
    res.cookies.set(ACCOUNT_COOKIE, accountId, accountCookieOptions);
    return res;
  },
);
