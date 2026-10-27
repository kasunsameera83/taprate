import { createHash } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS, hitRateLimit } from "@/lib/security/rateLimit";
import { kioskRateSchema } from "@/lib/validation/schemas";
import { parseKioskToken, createResponseToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { notifyRating } from "@/lib/afterRating";

// One tap on a kiosk = one confirmed rating. The kiosk secret is checked against its stored hash
// inside the database. Per-kiosk rate limits stop a stuck finger or a script from flooding results.
export const POST = secureRoute<undefined, undefined, z.infer<typeof kioskRateSchema>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.kioskPerIp, body: kioskRateSchema, maxBodyBytes: 512 },
  async ({ req, body, ipHash, requestId }) => {
    const parsed = parseKioskToken(body.kiosk);
    if (!parsed) return fail("not_found", "This kiosk link isn't valid.", undefined, requestId);

    const [burstOk, dailyOk] = await Promise.all([
      hitRateLimit(LIMITS.kioskBurst, parsed.kioskId),
      hitRateLimit(LIMITS.kioskDaily, parsed.kioskId),
    ]);
    if (!burstOk || !dailyOk) return fail("rate_limited", undefined, undefined, requestId);

    const tokenHash = createHash("sha256").update(parsed.secret).digest("hex");
    const { data, error } = await adminClient().rpc("record_kiosk_rating", {
      p_kiosk: parsed.kioskId,
      p_token_hash: tokenHash,
      p_rating: body.rating,
      p_ip_hash: ipHash,
      p_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });
    if (error) {
      if (error.message?.includes("rating out of range")) return fail("validation_failed", undefined, undefined, requestId);
      console.error("[kiosk] record failed", { code: error.code });
      return fail("unavailable", undefined, undefined, requestId);
    }
    if (!data) return fail("forbidden", "This kiosk isn't collecting ratings right now.", undefined, requestId);

    const responseId = data as string;
    after(() => notifyRating(responseId));
    // Short-lived token so the kiosk can add the reasons for this one rating.
    return ok({ responseId, responseToken: createResponseToken(env().RESPONSE_TOKEN_SECRET, responseId, undefined, 10 * 60) });
  },
);
