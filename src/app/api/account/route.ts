import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { accountUpdateSchema } from "@/lib/validation/schemas";
import { listMemberships, mfaState } from "@/lib/account";
import { audit } from "@/lib/audit";
import { logoUrl } from "@/lib/branding";

// Current user + active account. Works even with no account yet (shows invites / create account).
export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership, user }) => {
    const [all, mfa] = await Promise.all([listMemberships(supabase, user.id), mfaState(supabase)]);
    let account: { name: string; plan: string; credits: number; createdAt: string; logoUrl: string | null } | null = null;
    if (membership) {
      const { data, error } = await supabase
        .from("accounts")
        .select("name, plan, credit_balance, created_at, logo_path")
        .eq("id", membership.accountId)
        .maybeSingle();
      if (error) throw dbError(error);
      if (data) account = { name: data.name, plan: data.plan, credits: data.credit_balance, createdAt: data.created_at, logoUrl: logoUrl(data.logo_path) };
    }
    return ok({
      userId: user.id,
      email: user.email ?? null,
      mfaEnabled: mfa.enabled,
      account: account && membership ? { id: membership.accountId, ...account, role: membership.role, agentName: membership.agentName } : null,
      // Kept for older screens.
      name: account?.name ?? null,
      plan: account?.plan ?? null,
      credits: account?.credits ?? 0,
      role: membership?.role ?? null,
      memberships: all.map((m) => ({ accountId: m.accountId, accountName: m.accountName, role: m.role })),
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
