import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/server";
import { pushConfigured, pushToUsers } from "@/lib/push/server";

// Send a test alert to your own devices (for this business).
export const POST = secureRoute(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.integrationTest },
  async ({ membership, user, requestId }) => {
    if (!pushConfigured()) return fail("unavailable", "Phone alerts aren't set up on this server yet.", undefined, requestId);
    const sent = await pushToUsers(adminClient(), membership.accountId, [user.id], {
      title: "TapRate alerts are on",
      body: `You'll hear about unhappy customers of ${membership.accountName} straight away.`,
      url: "/app",
      tag: "test",
    });
    if (sent === 0) return fail("conflict", "No device got it. Turn alerts on for this device first.", undefined, requestId);
    return ok({ sent });
  },
);
