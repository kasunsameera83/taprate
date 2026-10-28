import type { NextConfig } from "next";

// Static security headers for every response. The Content-Security-Policy is set
// per request in src/middleware.ts because it carries a fresh nonce each time.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    // RFC 9116 location for the security contact (served by src/app/security-txt/route.ts).
    return [{ source: "/.well-known/security.txt", destination: "/security-txt" }];
  },
  async headers() {
    return [
      // Everything except the embeddable widget and testimonial wall refuses to be framed.
      { source: "/((?!w/|wall/).*)", headers: securityHeaders },
      { source: "/(w|wall)/:path*", headers: securityHeaders.filter((h) => h.key !== "X-Frame-Options" && h.key !== "Cross-Origin-Opener-Policy") },
      // Never let browsers or proxies cache API answers or survey clicks.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      {
        source: "/r/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          // Survey links carry the customer's email in the query string; never leak it onward.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/(s|w|k|tv)/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/(admin|reports)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/thanks/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
