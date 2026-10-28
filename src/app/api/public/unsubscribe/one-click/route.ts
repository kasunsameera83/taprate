import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { verifyPurposeToken } from "@/lib/security/signing";
import { UNSUB_SEND_PURPOSE, UNSUB_TTL_SECONDS } from "@/lib/sending/server";

// One-click unsubscribe (RFC 8058): Gmail, Outlook and Apple Mail POST here when someone presses their
// built-in "Unsubscribe" button. It comes from the mail provider, not our site, so it can't carry our
// same-origin check; instead the signed link in the query string proves which recipient it is for.
// Only POST with the exact RFC body is accepted, so link scanners (which use GET) can't unsubscribe anyone.
export const dynamic = "force-dynamic";
const MAX_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const done = (status = 200) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.unsubscribePerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return done(429);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return done(413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return done(413);
  if (!/(^|&)List-Unsubscribe=One-Click(&|$)/.test(raw.trim())) return done(400);

  const r = req.nextUrl.searchParams.get("r") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!UUID.test(r) || t.length > 60 || !verifyPurposeToken(e.RESPONSE_TOKEN_SECRET, UNSUB_SEND_PURPOSE, r, t, UNSUB_TTL_SECONDS)) return done(400);
  const { error } = await adminClient().rpc("unsubscribe_recipient", { p_recipient: r });
  return done(error ? 500 : 200);
}
