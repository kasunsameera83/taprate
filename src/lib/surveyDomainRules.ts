// Rules for a business's own survey web address. Pure, unit-tested; the database checks the same.
const HOST_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$/;
const BLOCKED = /(^|\.)(taptruly\.com|vercel\.app|vercel\.com|localhost)$/;

/** "https://Feedback.Kova.lk/" → "feedback.kova.lk", or null if it isn't an allowed subdomain. */
export function normalizeSurveyDomain(input: string): string | null {
  const d = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (d.length < 4 || d.length > 253 || !HOST_RE.test(d) || BLOCKED.test(d)) return null;
  return d;
}

/** Paths a custom survey domain may serve. Everything else goes to the main site. */
export const SURVEY_DOMAIN_PATHS = /^\/(r|thanks|s|k|w|wall|c|unsubscribe|closed|_next|brand|fonts)(\/|$)|^\/(favicon\.ico|icon\.svg|robots\.txt)$/;

/** The host a request was sent to (Vercel passes the original in x-forwarded-host). */
export function requestHost(headers: { get(name: string): string | null }): string {
  return (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
}
