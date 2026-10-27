import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { accountSwitchSchema } from "@/lib/validation/schemas";
import { listMemberships, ACCOUNT_COOKIE, accountCookieOptions } from "@/lib/account";

// Switch the active business. Only to an account the user is really a member of.
export const POST = secureRoute<undefined, undefined, z.infer<typeof accountSwitchSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: accountSwitchSchema, maxBodyBytes: 512 },
  async ({ supabase, user, body, requestId }) => {
    const all = await listMemberships(supabase, user.id);
    const target = all.find((m) => m.accountId === body.accountId);
    if (!target) return fail("not_found", undefined, undefined, requestId);
    const res = ok({ accountId: target.accountId, accountName: target.accountName, role: target.role });
    res.cookies.set(ACCOUNT_COOKIE, target.accountId, accountCookieOptions);
    return res;
  },
);
