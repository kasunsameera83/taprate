import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { deleteAccountSchema } from "@/lib/validation/schemas";
import { verifyPassword } from "@/lib/reauth";
import { ACCOUNT_COOKIE } from "@/lib/account";
import { audit } from "@/lib/audit";

// Permanently delete the business and all its data. Owner only, needs the exact business name AND the
// password (and 2FA, if on, via the wrapper). The database checks ownership again.
export const POST = secureRoute<undefined, undefined, z.infer<typeof deleteAccountSchema>>(
  { auth: "user", action: "account:delete", ipLimit: LIMITS.userWrite, userLimit: LIMITS.dangerous, body: deleteAccountSchema, maxBodyBytes: 1024 },
  async ({ supabase, membership, user, body, ipHash, requestId }) => {
    const { data: acct, error: readErr } = await supabase.from("accounts").select("name").eq("id", membership.accountId).maybeSingle();
    if (readErr) throw dbError(readErr);
    if (!acct) return fail("not_found", undefined, undefined, requestId);
    if (body.confirmName.trim() !== acct.name) {
      return fail("validation_failed", undefined, { confirmName: "That doesn't match the business name" }, requestId);
    }
    const check = await verifyPassword(user.id, user.email, body.password);
    if (check === "limited") return fail("rate_limited", undefined, undefined, requestId);
    if (check === "wrong") return fail("validation_failed", undefined, { password: "That password is incorrect" }, requestId);

    const { error } = await supabase.rpc("delete_account", { p_account: membership.accountId });
    if (error) throw dbError(error);

    // The account's own log is gone with it; keep a record without the account link.
    await audit({ accountId: null, userId: user.id, action: "account.deleted", targetType: "account", targetId: membership.accountId, ipHash });
    const res = ok({ deleted: true });
    res.cookies.delete(ACCOUNT_COOKIE);
    return res;
  },
);
