// What we send to Vercel Web Analytics (cookie-free page views). Pure function so it can be unit tested.
//  - Pages your customers open from a business (rating, survey, kiosk, TV, wall, thank-you, unsubscribe)
//    and sign-in/reset pages are NOT tracked at all: they carry private tokens and aren't our visitors.
//  - Everywhere else: no #hash, no query string except utm_* (to see which campaign brought a visit),
//    and ids in the path are replaced with ":id".

const NOT_TRACKED = [/^\/(r|s|c|h|k|w|tv|wall|thanks)(\/|$)/, /^\/unsubscribe(\/|$)/, /^\/reports\/unsubscribe(\/|$)/, /^\/closed(\/|$)/, /^\/auth(\/|$)/, /^\/reset-password(\/|$)/];
const KEEP_PARAMS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
const UUID_OR_NUMBER = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4,})$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // readable page names like "how-to-get-more-reviews"
/** A uuid, a long number, or a random-looking token (16+ chars with a digit, not a readable slug). */
function isId(seg: string): boolean {
  if (UUID_OR_NUMBER.test(seg)) return true;
  return seg.length >= 16 && /^[A-Za-z0-9_-]+$/.test(seg) && /\d/.test(seg) && !SLUG.test(seg);
}

/** Returns the URL to record, or null to record nothing. */
export function scrubAnalyticsUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (NOT_TRACKED.some((re) => re.test(u.pathname))) return null;
  const path = u.pathname
    .split("/")
    .map((seg) => (seg && isId(seg) ? ":id" : seg))
    .join("/");
  const params = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (KEEP_PARAMS.has(k.toLowerCase())) params.set(k.toLowerCase(), v.slice(0, 100));
  const query = params.toString();
  return `${u.origin}${path}${query ? `?${query}` : ""}`;
}
