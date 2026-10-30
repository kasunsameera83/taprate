import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/server";
import { planAllows, upgradeMessage } from "@/lib/billing/features";
import { normalizeSurveyDomain } from "@/lib/surveyDomainRules";
import { addHostingDomain, clearSurveyDomainCache, hostingConfigured, removeHostingDomain } from "@/lib/surveyDomains";
import { audit } from "@/lib/audit";

const body = z.object({ domain: z.string().max(260) }).strict();

// The business's own survey web address (e.g. feedback.kova.lk). Owners and admins see it; owners change it.
export const GET = secureRoute(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const [{ data, error }, { data: acct }] = await Promise.all([
      supabase.from("survey_domains").select("domain, status, records, checked_at, verified_at").eq("account_id", membership.accountId).maybeSingle(),
      supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle(),
    ]);
    if (error) throw dbError(error);
    return ok({ allowed: planAllows(acct?.plan as string | undefined, "custom_domain"), configured: hostingConfigured(), domain: data ?? null });
  },
);

export const POST = secureRoute<undefined, undefined, z.infer<typeof body>>(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.integrationTest, body, maxBodyBytes: 512 },
  async ({ supabase, membership, user, body: b, ipHash, requestId }) => {
    const { data: acct } = await supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle();
    if (!planAllows(acct?.plan as string | undefined, "custom_domain")) return fail("forbidden", upgradeMessage("custom_domain"), undefined, requestId);
    if (!hostingConfigured()) return fail("unavailable", "Custom web addresses aren't switched on for this server yet.", undefined, requestId);
    const domain = normalizeSurveyDomain(b.domain);
    if (!domain) return fail("validation_failed", undefined, { domain: "Use a subdomain you own, like feedback.yourbusiness.com" }, requestId);

    const db = adminClient();
    const { data: existing } = await db.from("survey_domains").select("id").eq("account_id", membership.accountId).maybeSingle();
    if (existing) return fail("conflict", "Remove your current address first.", undefined, requestId);
    const { data: taken } = await db.from("survey_domains").select("id, account_id").eq("domain", domain).neq("account_id", membership.accountId).maybeSingle();
    if (taken) return fail("conflict", "That address is already used by another business.", undefined, requestId);

    const added = await addHostingDomain(domain);
    if (!added.ok) return fail("validation_failed", undefined, { domain: added.message ?? "Couldn't add that address." }, requestId);
    const { error } = await db.from("survey_domains").insert({ account_id: membership.accountId, domain, records: added.records });
    if (error) {
      await removeHostingDomain(domain);
      throw dbError(error);
    }
    clearSurveyDomainCache(membership.accountId, domain);
    await audit({ accountId: membership.accountId, userId: user.id, action: "survey_domain.added", metadata: { domain }, ipHash });
    return ok({ domain, records: added.records }, 201);
  },
);

export const DELETE = secureRoute(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite },
  async ({ membership, user, ipHash }) => {
    const db = adminClient();
    const { data } = await db.from("survey_domains").select("domain").eq("account_id", membership.accountId).maybeSingle();
    if (data?.domain) {
      await removeHostingDomain(data.domain as string);
      const { error } = await db.from("survey_domains").delete().eq("account_id", membership.accountId);
      if (error) throw dbError(error);
      clearSurveyDomainCache(membership.accountId, data.domain as string);
      await audit({ accountId: membership.accountId, userId: user.id, action: "survey_domain.removed", metadata: { domain: data.domain as string }, ipHash });
    }
    return ok({ removed: true });
  },
);
