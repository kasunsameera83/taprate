import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { publicConfirmSchema } from "@/lib/validation/schemas";
import { verifyResponseToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { notifyRating } from "@/lib/afterRating";
import { after } from "next/server";

// Called by the thank-you page once it has loaded in a real browser. This is what turns a
// pending click into a counted rating (and uses a credit). Scanners that only fetch the link
// never get here.
export const POST = secureRoute<undefined, undefined, z.infer<typeof publicConfirmSchema>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.publicPerIp, body: publicConfirmSchema, maxBodyBytes: 1024 },
  async ({ body }) => {
    if (!verifyResponseToken(env().RESPONSE_TOKEN_SECRET, body.responseId, body.token)) {
      return fail("forbidden", "This link has expired.");
    }

    const db = adminClient();
    const { data, error } = await db.rpc("confirm_response", { p_response: body.responseId });
    if (error) {
      console.error("[confirm] failed", { code: error.code });
      return fail("unavailable");
    }
    const result = (Array.isArray(data) ? data[0] : data) as
      | { result: string; account_id: string | null; survey_id: string | null; rating: number | null; rating_changed: boolean }
      | undefined;
    if (!result || result.result === "not_found") return fail("not_found");
    if (result.result === "no_credit") return ok({ status: "closed" });

    // Alerts and integrations run after the response is sent, so the customer never waits for them.
    if (result.result === "confirmed" && result.rating_changed) after(() => notifyRating(body.responseId));

    return ok({ status: "recorded" });
  },
);
