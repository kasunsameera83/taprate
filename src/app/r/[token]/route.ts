import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { parseLinkToken, verifyLinkToken, verifyMetadata, createResponseToken } from "@/lib/security/signing";
import { detectBot } from "@/lib/security/bot";
import { getClientIp, hashIp, buildDedupeKey } from "@/lib/security/request";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { parseClickParams } from "@/lib/validation/schemas";

// THE ONE-CLICK ENDPOINT. Public (customers aren't logged in), so it checks everything itself:
//   1. link format + HMAC signature     -> nobody can forge or alter a rating link
//   2. bot / scanner detection          -> automated link openers record nothing
//   3. rate limits per IP and per survey
//   4. recipient details validated; trusted only if signed
//   5. click stored as PENDING, de-duplicated per recipient/ticket
//   6. redirect to the thank-you page, which confirms from a real browser
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#111827;text-align:center}p{color:#4b5563}</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`;
  return new Response(html, {
    status,
    headers: {
      ...NO_STORE,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}

const closed = () => NextResponse.redirect(`${env().appOrigin}/closed`, { status: 303, headers: NO_STORE });

// Next.js would answer HEAD with GET if we didn't define it. Scanners use HEAD: record nothing.
export function HEAD() {
  return new Response(null, { status: 204, headers: NO_STORE });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const e = env();
    const { token } = await ctx.params;

    // 1. Signature
    const parsed = parseLinkToken(token);
    if (!parsed || !verifyLinkToken(e.linkSecrets, parsed)) {
      return page(404, "Link not valid", "This feedback link isn't valid. Please use the buttons in your email.");
    }

    // 2. Bots and scanners
    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 300);
    const bot = detectBot({ method: req.method, userAgent, headers: req.headers });
    if (bot.bot) {
      return page(200, "Thanks", "Open this link in your web browser to leave your rating.");
    }

    // 3. Rate limits
    const ipHash = hashIp(e.IP_HASH_SALT, getClientIp(req.headers));
    const [ipOk, surveyOk] = await Promise.all([
      hitRateLimit(LIMITS.clickPerIp, ipHash),
      hitRateLimit(LIMITS.clickPerSurvey, parsed.surveyId),
    ]);
    if (!ipOk || !surveyOk) {
      return page(429, "Please slow down", "We received too many clicks from your connection. Please try again in a minute.");
    }

    // 4. Recipient details
    const meta = parseClickParams(req.nextUrl.searchParams);
    const verified =
      meta.metaSig !== null &&
      verifyMetadata(e.linkSecrets, parsed.surveyId, { email: meta.email, agent: meta.agent, ticket: meta.ticket }, meta.metaSig);

    // 5. Record as pending
    const dedupeKey = buildDedupeKey({ surveyId: parsed.surveyId, email: meta.email, ticket: meta.ticket, ipHash, userAgent });
    const { data: responseId, error } = await adminClient().rpc("record_click", {
      p_survey: parsed.surveyId,
      p_rating: parsed.rating,
      p_dedupe_key: dedupeKey,
      p_email: meta.email,
      p_agent: meta.agent,
      p_ticket: meta.ticket,
      p_verified: verified,
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
      p_channel: meta.channel === "kiosk" ? "email" : meta.channel,
    });

    if (error) {
      // e.g. a validly signed rating that doesn't fit the survey's scale
      if (error.message?.includes("rating out of range")) return page(400, "Link not valid", "This feedback link isn't valid.");
      console.error("[click] record failed", { code: error.code });
      return page(503, "Please try again", "We couldn't save your rating just now. Please click the button again.");
    }
    if (!responseId || typeof responseId !== "string") return closed(); // inactive survey or no credits

    // 6. Thank-you page (confirms the click from a real browser)
    const k = createResponseToken(e.RESPONSE_TOKEN_SECRET, responseId);
    return NextResponse.redirect(`${e.appOrigin}/thanks/${responseId}?k=${encodeURIComponent(k)}`, { status: 303, headers: NO_STORE });
  } catch (err) {
    console.error("[click] unhandled", { err });
    return page(500, "Please try again", "Something went wrong. Please click the button in your email again.");
  }
}
