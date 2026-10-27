import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { accountUpdateSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

export const GET = secureRoute(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership, user }) => {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name, plan, credit_balance, created_at")
      .eq("id", membership.accountId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found");
    return ok({
      name: data.name,
      plan: data.plan,
      credits: data.credit_balance,
      createdAt: data.created_at,
      role: membership.role,
      email: user.email ?? null,
    });
  },
);

export const PATCH = secureRoute<undefined, undefined, z.infer<typeof accountUpdateSchema>>(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: accountUpdateSchema },
  async ({ supabase, membership, user, body, ipHash }) => {
    const { data, error } = await supabase
      .from("accounts")
      .update({ name: body.name })
      .eq("id", membership.accountId)
      .select("name")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found");
    await audit({ accountId: membership.accountId, userId: user.id, action: "account.rename", ipHash });
    return ok({ name: data.name });
  },
);
