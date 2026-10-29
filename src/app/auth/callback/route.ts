import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";

// Email confirmation link lands here. Always redirects to a fixed path on our own origin
// (no "next" parameter), so it can't be abused as an open redirect.
export async function GET(req: NextRequest) {
  const e = env();
  const base = e.appOrigin;
  const ipHash = hashIp(e.IP_HASH_SALT, getClientIp(req.headers));
  if (!(await hitRateLimit(LIMITS.publicPerIp, ipHash))) return NextResponse.redirect(`${base}/login?error=busy`);

  const safe = (v: string | null) => v !== null && v.length <= 512 && /^[A-Za-z0-9._-]+$/.test(v);
  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");
  const supabase = await userClient();
  let ok = false;
  if (safe(tokenHash) && (type === "email" || type === "signup" || type === "email_change")) {
    // Works on any device (the branded email templates link here with token_hash).
    const { error } = await supabase.auth.verifyOtp({ type: type === "signup" ? "email" : type, token_hash: tokenHash! });
    ok = !error;
  } else if (safe(code)) {
    // Supabase's default link (only works in the browser that signed up).
    const { error } = await supabase.auth.exchangeCodeForSession(code!);
    ok = !error;
  }
  if (!ok) return NextResponse.redirect(`${base}/login?error=link`);
  return NextResponse.redirect(`${base}/app`);
}
