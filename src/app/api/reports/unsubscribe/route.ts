import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { verifyPurposeToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { UNSUB_PURPOSE } from "@/lib/insights/reportEmail";
import { WINS_UNSUB_PURPOSE } from "@/lib/insights/winsEmail";

// s = a report subscription; w = a person's weekly "wins" email.
const body = z.union([z.object({ s: uuidSchema, t: z.string().max(60) }).strict(), z.object({ w: uuidSchema, t: z.string().max(60) }).strict()]);

// One-click "stop these emails" from the email footer. No sign-in needed; the signed token proves the
// link came from an email we sent to this person. (A button on the page calls this, so email
// scanners that open links don't unsubscribe people by accident.)
export const POST = secureRoute<undefined, undefined, z.infer<typeof body>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.publicPerIp, body, maxBodyBytes: 256 },
  async ({ body: b, requestId }) => {
    const secret = env().RESPONSE_TOKEN_SECRET;
    if ("w" in b) {
      if (!verifyPurposeToken(secret, WINS_UNSUB_PURPOSE, b.w, b.t, 90 * 86400)) return fail("forbidden", "This link has expired. Ask your team owner to stop these emails.", undefined, requestId);
      const { error } = await adminClient().rpc("wins_opt_out", { p_user: b.w });
      if (error) return fail("internal_error", undefined, undefined, requestId);
      return ok({ unsubscribed: true });
    }
    if (!verifyPurposeToken(secret, UNSUB_PURPOSE, b.s, b.t, 90 * 86400)) return fail("forbidden", "This link has expired. You can change reports in TapRate settings.", undefined, requestId);
    await adminClient().from("report_subscriptions").delete().eq("id", b.s);
    return ok({ unsubscribed: true });
  },
);
