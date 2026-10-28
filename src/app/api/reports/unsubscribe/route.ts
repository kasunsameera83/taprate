import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { verifyPurposeToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { UNSUB_PURPOSE } from "@/lib/insights/reportEmail";

const body = z.object({ s: uuidSchema, t: z.string().max(60) }).strict();

// One-click "stop these emails" from the email footer. No sign-in needed; the signed token proves the
// link came from a report we sent for this subscription. (A button on the page calls this, so email
// scanners that open links don't unsubscribe people by accident.)
export const POST = secureRoute<undefined, undefined, z.infer<typeof body>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.publicPerIp, body, maxBodyBytes: 256 },
  async ({ body: b, requestId }) => {
    if (!verifyPurposeToken(env().RESPONSE_TOKEN_SECRET, UNSUB_PURPOSE, b.s, b.t, 90 * 86400)) return fail("forbidden", "This link has expired. You can change reports in TapRate settings.", undefined, requestId);
    await adminClient().from("report_subscriptions").delete().eq("id", b.s);
    return ok({ unsubscribed: true });
  },
);
