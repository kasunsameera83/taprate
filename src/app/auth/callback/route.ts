import { NextResponse, type NextRequest } from "next/server";
import { adminClient, userClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { audit } from "@/lib/audit";
import { COMPANY } from "@/lib/site/company";
import { visitorCountry } from "@/lib/site/geo";
import { attachReferral } from "@/lib/referrals/server";
import { GOOGLE_REF_COOKIE, REF_CODE, isNewGoogleUser } from "@/lib/auth/google";

// Email confirmation links and "Continue with Google" land here. Always redirects to a fixed path on our
// own origin (no "next" parameter), so it can't be abused as an open redirect.
export async function GET(req: NextRequest) {
  const e = env();
  const base = e.appOrigin;
  const ipHash = hashIp(e.IP_HASH_SALT, getClientIp(req.headers));
  if (!(await hitRateLimit(LIMITS.publicPerIp, ipHash))) return NextResponse.redirect(`${base}/login?error=busy`);

  const params = req.nextUrl.searchParams;
  // Google sign-in cancelled or refused: say so plainly (the details stay in Google's message, not shown).
  if (params.get("error")) return NextResponse.redirect(`${base}/login?error=google`);

  const safe = (v: string | null) => v !== null && v.length <= 512 && /^[A-Za-z0-9._-]+$/.test(v);
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const supabase = await userClient();
  let ok = false;
  if (safe(tokenHash) && (type === "email" || type === "signup" || type === "email_change")) {
    // Works on any device (the branded email templates link here with token_hash).
    const { error } = await supabase.auth.verifyOtp({ type: type === "signup" ? "email" : type, token_hash: tokenHash! });
    ok = !error;
  } else if (safe(code)) {
    // Supabase's default email link, or the return from Google (PKCE: only works in the browser that started it).
    const { data, error } = await supabase.auth.exchangeCodeForSession(code!);
    ok = !error;
    if (ok && data?.user && isNewGoogleUser(data.user)) {
      const res = NextResponse.redirect(`${base}/app/welcome`);
      await finishGoogleSignup(data.user.id, req.cookies.get(GOOGLE_REF_COOKIE)?.value, ipHash);
      res.cookies.set(GOOGLE_REF_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/auth/callback", maxAge: 0 });
      return res;
    }
    if (ok && data?.user) await audit({ accountId: null, userId: data.user.id, action: "auth.login", metadata: { method: "google" }, ipHash });
  }
  if (!ok) return NextResponse.redirect(`${base}/login?error=link`);
  return NextResponse.redirect(`${base}/app`);
}

/** The same follow-up steps as an email sign-up: record the Terms they agreed to, local languages, referral. */
async function finishGoogleSignup(userId: string, ref: string | undefined, ipHash: string): Promise<void> {
  try {
    // They saw "By continuing with Google, you agree to the Terms and Privacy Policy" next to the button.
    await adminClient().auth.admin.updateUserById(userId, {
      user_metadata: { terms_version: COMPANY.termsVersion, terms_accepted_at: new Date().toISOString() },
    });
    if ((await visitorCountry()) === "LK") await adminClient().rpc("enable_local_languages_for_new_user", { p_user: userId });
    if (ref && REF_CODE.test(ref)) await attachReferral(userId, ref);
    await audit({ accountId: null, userId, action: "auth.signup", metadata: { terms_version: COMPANY.termsVersion, method: "google" }, ipHash });
  } catch {
    console.error("[google] sign-up follow-up failed");
  }
}
