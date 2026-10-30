import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/server";
import { checkHostingDomain, clearSurveyDomainCache, hostingConfigured } from "@/lib/surveyDomains";
import { audit } from "@/lib/audit";

// "Check DNS": asks the hosting provider whether the address now points to us (and has HTTPS).
export const POST = secureRoute(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.integrationTest },
  async ({ membership, user, ipHash, requestId }) => {
    if (!hostingConfigured()) return fail("unavailable", "Custom web addresses aren't switched on for this server yet.", undefined, requestId);
    const db = adminClient();
    const { data } = await db.from("survey_domains").select("domain, status").eq("account_id", membership.accountId).maybeSingle();
    if (!data) return fail("not_found", undefined, undefined, requestId);
    const result = await checkHostingDomain(data.domain as string);
    const now = new Date().toISOString();
    const { error } = await db
      .from("survey_domains")
      .update({ status: result.verified ? "verified" : "pending", records: result.records, checked_at: now, ...(result.verified && data.status !== "verified" ? { verified_at: now } : {}) })
      .eq("account_id", membership.accountId);
    if (error) throw dbError(error);
    clearSurveyDomainCache(membership.accountId, data.domain as string);
    if (result.verified && data.status !== "verified") await audit({ accountId: membership.accountId, userId: user.id, action: "survey_domain.verified", metadata: { domain: data.domain as string }, ipHash });
    return ok({ verified: result.verified, records: result.records });
  },
);
