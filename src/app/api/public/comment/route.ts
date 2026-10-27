import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { publicCommentSchema } from "@/lib/validation/schemas";
import { verifyResponseToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Adds or replaces the comment on the customer's own response. The signed, time-limited token
// proves they are the person who clicked; the survey must allow comments.
export const POST = secureRoute<undefined, undefined, z.infer<typeof publicCommentSchema>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.publicPerIp, body: publicCommentSchema, maxBodyBytes: 12 * 1024 },
  async ({ body, requestId }) => {
    if (!verifyResponseToken(env().RESPONSE_TOKEN_SECRET, body.responseId, body.token)) {
      return fail("forbidden", "This link has expired.", undefined, requestId);
    }
    if (!(await hitRateLimit(LIMITS.commentPerResponse, body.responseId))) {
      return fail("rate_limited", undefined, undefined, requestId);
    }

    const db = adminClient();
    const { data: response, error: readErr } = await db
      .from("responses")
      .select("id, status, surveys(allow_comment, status)")
      .eq("id", body.responseId)
      .maybeSingle();
    if (readErr) return fail("unavailable", undefined, undefined, requestId);
    const survey = (response?.surveys ?? null) as unknown as { allow_comment: boolean; status: string } | null;
    if (!response || !survey) return fail("not_found", undefined, undefined, requestId);
    if (!survey.allow_comment || survey.status !== "active") {
      return fail("forbidden", "Comments are turned off for this survey.", undefined, requestId);
    }
    // Only count comments on ratings a real browser confirmed.
    if (response.status !== "confirmed") return fail("conflict", "Please wait a moment and try again.", undefined, requestId);

    const { error } = await db.from("responses").update({ comment: body.comment }).eq("id", body.responseId);
    if (error) return fail("unavailable", undefined, undefined, requestId);
    return ok({ saved: true });
  },
);
