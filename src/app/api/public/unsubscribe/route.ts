import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { verifyPurposeToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { UNSUB_SEND_PURPOSE, UNSUB_TTL_SECONDS } from "@/lib/sending/server";

const body = z.object({ r: uuidSchema, t: z.string().max(60) }).strict();

// "Stop survey emails from this business", from the button on the unsubscribe page. No sign-in: the
// signed link proves it came from an email we sent to this person. (A button, not the link itself, so
// email scanners that open links don't unsubscribe people by accident.)
export const POST = secureRoute<undefined, undefined, z.infer<typeof body>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.unsubscribePerIp, body, maxBodyBytes: 256 },
  async ({ body: b, requestId }) => {
    if (!verifyPurposeToken(env().RESPONSE_TOKEN_SECRET, UNSUB_SEND_PURPOSE, b.r, b.t, UNSUB_TTL_SECONDS)) {
      return fail("forbidden", "This link has expired. Reply to the email and ask the business to stop.", undefined, requestId);
    }
    const { error } = await adminClient().rpc("unsubscribe_recipient", { p_recipient: b.r });
    if (error) return fail("internal_error", undefined, undefined, requestId);
    return ok({ unsubscribed: true });
  },
);
