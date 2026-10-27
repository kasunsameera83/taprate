import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Runs before every page request:
//   * sets a strict Content-Security-Policy with a fresh nonce (blocks injected scripts)
//   * refreshes the Supabase session cookie for signed-in areas
//   * sends signed-out visitors away from /app
// API routes do their own full auth checks; middleware is never the only guard.

function buildCsp(nonce: string): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabase}`.trim(),
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    dev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

const NEEDS_SESSION = /^\/(app|login|signup)(\/|$)/;

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID()); // Edge runtime: no Buffer
  const csp = buildCsp(nonce);

  const withSecurityHeaders = () => {
    const h = new Headers(request.headers);
    h.set("x-nonce", nonce);
    h.set("Content-Security-Policy", csp);
    return h;
  };

  let response = NextResponse.next({ request: { headers: withSecurityHeaders() } });

  if (NEEDS_SESSION.test(request.nextUrl.pathname)) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: withSecurityHeaders() } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
          }
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const path = request.nextUrl.pathname;

    let redirectTo: string | null = null;
    if (!user && path.startsWith("/app")) redirectTo = "/login";
    if (user && (path === "/login" || path === "/signup")) redirectTo = "/app";

    if (redirectTo) {
      const redirect = NextResponse.redirect(new URL(redirectTo, request.url));
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: skip API routes (they authenticate themselves), the click endpoint and static files.
    "/((?!api/|r/|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
