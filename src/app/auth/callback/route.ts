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

  const code = req.nextUrl.searchParams.get("code");
  if (!code || code.length > 512 || !/^[A-Za-z0-9._-]+$/.test(code)) {
    return NextResponse.redirect(`${base}/login?error=link`);
  }
  const supabase = await userClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${base}/login?error=link`);
  return NextResponse.redirect(`${base}/app`);
}
