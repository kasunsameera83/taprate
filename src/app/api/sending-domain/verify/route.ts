import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/server";
import { refreshProviderDomain } from "@/lib/sending/domains";

// "Check DNS": asks the provider to verify the records and saves what it says.
export const POST = secureRoute(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.integrationTest },
  async ({ membership, requestId }) => {
    const { data } = await adminClient().from("sending_domains").select("id, provider_id, verified_at").eq("account_id", membership.accountId).maybeSingle();
    if (!data) return fail("not_found", "Add a domain first.", undefined, requestId);
    const d = await refreshProviderDomain(data.provider_id);
    if (!d) return fail("unavailable", "Couldn't reach the email provider. Try again in a minute.", undefined, requestId);
    const now = new Date().toISOString();
    await adminClient()
      .from("sending_domains")
      .update({ status: d.status, records: d.records, checked_at: now, verified_at: d.status === "verified" ? (data.verified_at ?? now) : null })
      .eq("account_id", membership.accountId);
    return ok({ status: d.status });
  },
);
