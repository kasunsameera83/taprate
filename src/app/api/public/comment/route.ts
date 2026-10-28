import { z } from "zod";
import { after } from "next/server";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { publicCommentSchema } from "@/lib/validation/schemas";
import { verifyResponseToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { dispatchComment } from "@/lib/integrations";

// Adds the customer's comment and/or reasons to their own response. The signed, time-limited token
// proves they are the person who clicked. Reasons must be ones the survey offers for that rating
// (checked here and again by the database).
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
      .select("id, status, sentiment, comment, surveys(allow_comment, status, drivers_positive, drivers_negative)")
      .eq("id", body.responseId)
      .maybeSingle();
    if (readErr) return fail("unavailable", undefined, undefined, requestId);
    const survey = (response?.surveys ?? null) as unknown as {
      allow_comment: boolean;
      status: string;
      drivers_positive: string[];
      drivers_negative: string[];
    } | null;
    if (!response || !survey) return fail("not_found", undefined, undefined, requestId);
    if (survey.status !== "active") return fail("forbidden", "This survey isn't collecting feedback right now.", undefined, requestId);
    // Only ratings a real browser confirmed can get extra detail.
    if (response.status !== "confirmed") return fail("conflict", "Please wait a moment and try again.", undefined, requestId);

    const update: { comment?: string; drivers?: string[]; share_consent?: boolean; display_name?: string | null } = {};
    if (body.comment !== undefined) {
      if (!survey.allow_comment) return fail("forbidden", "Comments are turned off for this survey.", undefined, requestId);
      update.comment = body.comment;
    }
    if (body.drivers !== undefined) {
      const allowed = response.sentiment === "positive" ? survey.drivers_positive : survey.drivers_negative;
      const unique = [...new Set(body.drivers)];
      if (unique.some((d) => !allowed.includes(d))) return fail("validation_failed", "Pick reasons from the list.", undefined, requestId);
      update.drivers = unique;
    }

    if (body.shareConsent !== undefined) {
      // Only happy customers are asked; the database also drops the name and un-features when consent is off.
      if (response.sentiment !== "positive" && body.shareConsent) return fail("validation_failed", undefined, undefined, requestId);
      update.share_consent = body.shareConsent;
      update.display_name = body.shareConsent ? body.displayName || null : null;
    }

    const { error } = await db.from("responses").update(update).eq("id", body.responseId);
    if (error) return fail("unavailable", undefined, undefined, requestId);
    // The first comment is also added to the helpdesk ticket (later edits aren't, so a ticket can't be spammed).
    if (update.comment && !response.comment) after(() => dispatchComment(body.responseId));
    return ok({ saved: true });
  },
);
