import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { checkHelpdesk, deliverTo, type IntegrationRow, type RatingEvent } from "@/lib/integrations";
import { isHelpdesk, type HelpdeskKind } from "@/lib/security/urlSafety";
import { planAllows, upgradeMessage } from "@/lib/billing/features";

const params = z.object({ id: uuidSchema }).strict();

// Sends a clearly-labelled sample rating so the business can check the connection works.
export const POST = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "integrations:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.integrationTest, params },
  async ({ membership, params, requestId }) => {
    const { data: row } = await adminClient()
      .from("integrations")
      .select("id, kind, url_encrypted, secret_encrypted, events")
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .maybeSingle();
    if (!row) return fail("not_found", undefined, undefined, requestId);
    const integration = row as IntegrationRow;
    // Connections are a paid feature (0031): no test sends while the business is on the free plan.
    const { data: acct } = await adminClient().from("accounts").select("plan").eq("id", membership.accountId).maybeSingle();
    if (!planAllows(acct?.plan as string | undefined, "integrations")) return fail("forbidden", upgradeMessage("integrations"), undefined, requestId);

    // Shopify sends to us, not the other way round: the test happens on Shopify's side.
    if (integration.kind === "shopify") {
      return fail("validation_failed", "In Shopify, open Settings → Notifications → Webhooks and press “Send test” next to this webhook. This connection shows “working” when it arrives.", undefined, requestId);
    }

    // Helpdesks: a read-only check of the address and credentials (no test note on a real ticket).
    if (isHelpdesk(integration.kind)) {
      const r = await checkHelpdesk(integration as IntegrationRow & { kind: HelpdeskKind });
      if (r === "ok") return ok({ delivered: true });
      if (r === "blocked") return fail("validation_failed", "That address points to a private network, so TapTruly won't send to it.", undefined, requestId);
      return fail("unavailable", "Couldn't sign in to your helpdesk. Check the address, email and API token/key.", undefined, requestId);
    }

    const sample: RatingEvent = {
      id: "00000000-0000-4000-8000-000000000000",
      accountId: membership.accountId,
      survey: { id: "00000000-0000-4000-8000-000000000000", name: "Test from TapTruly" },
      rating: 1,
      ratingLabel: "Very poor (test)",
      sentiment: "negative",
      email: "customer@example.com",
      agent: "Test agent",
      ticket: "TEST-1",
      channel: "email",
      createdAt: new Date().toISOString(),
    };
    const result = await deliverTo(integration, sample);
    if (result === "ok") return ok({ delivered: true });
    if (result === "blocked") return fail("validation_failed", "That address points to a private network, so TapTruly won't send to it.", undefined, requestId);
    return fail("unavailable", "The test didn't go through. Check the URL is still valid in Slack/Teams/your app.", undefined, requestId);
  },
);
