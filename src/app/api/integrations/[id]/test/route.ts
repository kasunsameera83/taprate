import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { deliverTo, type RatingEvent } from "@/lib/integrations";
import type { IntegrationKind } from "@/lib/security/urlSafety";

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

    const sample: RatingEvent = {
      id: "00000000-0000-4000-8000-000000000000",
      accountId: membership.accountId,
      survey: { id: "00000000-0000-4000-8000-000000000000", name: "Test from TapRate" },
      rating: 1,
      ratingLabel: "Very poor (test)",
      sentiment: "negative",
      email: "customer@example.com",
      agent: "Test agent",
      ticket: "TEST-1",
      channel: "email",
      createdAt: new Date().toISOString(),
    };
    const result = await deliverTo(row as { id: string; kind: IntegrationKind; url_encrypted: string; secret_encrypted: string | null; events: string[] }, sample);
    if (result === "ok") return ok({ delivered: true });
    if (result === "blocked") return fail("validation_failed", "That address points to a private network, so TapRate won't send to it.", undefined, requestId);
    return fail("unavailable", "The test didn't go through. Check the URL is still valid in Slack/Teams/your app.", undefined, requestId);
  },
);
