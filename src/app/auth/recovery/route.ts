import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { createPurposeToken } from "@/lib/security/signing";
import { PW_RESET_COOKIE, PW_RESET_TTL } from "@/lib/passwordReset";

// The password-reset email link lands here. Signs the user in for the reset, marks this browser as
// "allowed to set a new password for the next 15 minutes" with a signed cookie, then sends them to
// the fixed /reset-password page (no redirect parameter, so no open redirect).
export async function GET(req: NextRequest) {
  const e = env();
  const base = e.appOrigin;
  const ipHash = hashIp(e.IP_HASH_SALT, getClientIp(req.headers));
  if (!(await hitRateLimit(LIMITS.publicPerIp, ipHash))) return NextResponse.redirect(`${base}/forgot-password?error=busy`);

  const supabase = await userClient();
  const code = req.nextUrl.searchParams.get("code");
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const safe = (v: string | null) => v !== null && v.length <= 512 && /^[A-Za-z0-9._-]+$/.test(v);

  let ok = false;
  if (safe(tokenHash)) {
    // Works across devices (needs the Supabase "Reset password" email template to use token_hash).
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash! });
    ok = !error;
  } else if (safe(code)) {
    const { error } = await supabase.auth.exchangeCodeForSession(code!);
    ok = !error;
  }
  if (!ok) return NextResponse.redirect(`${base}/forgot-password?error=link`);

  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(`${base}/forgot-password?error=link`);

  const res = NextResponse.redirect(`${base}/reset-password`);
  res.cookies.set(PW_RESET_COOKIE, createPurposeToken(e.RESPONSE_TOKEN_SECRET, "password-reset", data.user.id, PW_RESET_TTL), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PW_RESET_TTL,
  });
  return res;
}
