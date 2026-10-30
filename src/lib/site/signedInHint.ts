// A tiny "you're signed in" hint for the public website's header, so it can show "Dashboard"
// instead of "Sign in" without making every marketing page dynamic or loading Supabase in the browser.
//
// It is ONLY a display hint: it holds no session data, it isn't trusted anywhere, and anyone can set it.
// The real session cookies stay httpOnly. /app and every API route still check the session themselves,
// so a stale or forged hint just shows a Dashboard link that leads to the sign-in page.
export const SIGNED_IN_HINT = "tt_in";

export const signedInHintCookie = (on: boolean) => ({
  name: SIGNED_IN_HINT,
  value: on ? "1" : "",
  options: {
    httpOnly: false, // read by the header script on purpose
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: on ? 60 * 60 * 24 * 30 : 0,
  },
});

/** Browser side: is the hint present? */
export function hasSignedInHint(cookie: string): boolean {
  return cookie.split(";").some((c) => c.trim() === `${SIGNED_IN_HINT}=1`);
}
