"use client";
import { Analytics } from "@vercel/analytics/next";
import { scrubAnalyticsUrl } from "@/lib/analytics/scrub";

// Cookie-free visitor counts (Vercel Web Analytics). Same-origin script and endpoint, so the strict CSP
// needs no change. Private pages and tokens never leave the browser: see scrubAnalyticsUrl.
export function WebAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = scrubAnalyticsUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
