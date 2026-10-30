import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/server";
import { sendingDomainSchema } from "@/lib/sending/domainRules";
import { createProviderDomain, deleteProviderDomain } from "@/lib/sending/domains";
import { audit } from "@/lib/audit";
import { planAllows, upgradeMessage } from "@/lib/billing/features";


// The business's own sending domain (owners and admins can see it; owners change it).
export const GET = secureRoute(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const [{ data, error }, { data: acct }] = await Promise.all([
      supabase.from("sending_domains").select("domain, from_local, status, records, checked_at, verified_at").eq("account_id", membership.accountId).maybeSingle(),
      supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle(),
    ]);
    if (error) throw dbError(error);
    return ok({ allowed: planAllows(acct?.plan, "own_domain"), domain: data ?? null });
  },
);

export const POST = secureRoute<undefined, undefined, z.infer<typeof sendingDomainSchema>>(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.integrationTest, body: sendingDomainSchema, maxBodyBytes: 512 },
  async ({ supabase, membership, user, body, ipHash, requestId }) => {
    const { data: acct } = await supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle();
    if (!planAllows(acct?.plan, "own_domain")) return fail("forbidden", upgradeMessage("own_domain"), undefined, requestId);
    const db = adminClient();
    const { data: existing } = await db.from("sending_domains").select("id").eq("account_id", membership.accountId).maybeSingle();
    if (existing) return fail("conflict", "Remove your current domain first.", undefined, requestId);
    const { data: taken } = await db.from("sending_domains").select("account_id").eq("domain", body.domain).neq("account_id", membership.accountId).maybeSingle();
    if (taken) return fail("conflict", "That domain is already used by another business.", undefined, requestId);

    const created = await createProviderDomain(body.domain);
    if ("error" in created) return fail("unavailable", created.error, undefined, requestId);
    const { error } = await adminClient()
      .from("sending_domains")
      .insert({ account_id: membership.accountId, domain: body.domain, from_local: body.fromLocal, provider_id: created.id, status: created.status, records: created.records, created_by: user.id });
    if (error) {
      await deleteProviderDomain(created.id);
      throw dbError(error);
    }
    await audit({ accountId: membership.accountId, userId: user.id, action: "domain.added", targetType: "domain", targetId: body.domain, ipHash });
    return ok({ added: true }, 201);
  },
);

export const DELETE = secureRoute(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite },
  async ({ membership, user, ipHash }) => {
    const { data } = await adminClient().from("sending_domains").select("id, provider_id, domain").eq("account_id", membership.accountId).maybeSingle();
    if (data) {
      await deleteProviderDomain(data.provider_id);
      await adminClient().from("sending_domains").delete().eq("account_id", membership.accountId);
      await audit({ accountId: membership.accountId, userId: user.id, action: "domain.removed", targetType: "domain", targetId: data.domain, ipHash });
    }
    return ok({ removed: true });
  },
);
