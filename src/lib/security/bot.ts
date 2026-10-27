// Detects automated link openers: email security scanners, link previewers, prefetchers.
// This is the FIRST filter only. The real guarantee is that a click stays "pending" until
// the thank-you page confirms it from a real browser (see /api/public/confirm).
// Pure function, unit-tested.

export type BotCheckInput = {
  method: string;
  userAgent: string | null;
  headers: { get(name: string): string | null };
};

export type BotCheckResult = { bot: boolean; reason?: string };

const BOT_UA_PATTERNS: Array<[RegExp, string]> = [
  [/bot\b|crawler|spider|slurp/i, "crawler"],
  [/preview|unfurl|embedly|facebookexternalhit|slackbot|discordbot|whatsapp|telegrambot|skypeuripreview|linkedinbot|twitterbot/i, "link-preview"],
  [/googleimageproxy|yahoomailproxy|ggpht\.com/i, "mail-image-proxy"],
  [/mimecast|proofpoint|barracuda|symantec|messagelabs|forcepoint|trendmicro|sophos|fortiguard|zscaler|ironport|cisco.*(email|esa)|safelinks|urldefense|appriver|mailguard|vadesecure|libraesva|hornetsecurity/i, "email-security-scanner"],
  [/microsoft office|ms-office|msoffice|outlook-ios-linkpreview|microsoft-webdav|ms-word|excel\//i, "office-prefetch"],
  [/headlesschrome|phantomjs|puppeteer|playwright|selenium|electron\/.*headless/i, "headless-browser"],
  [/^(curl|wget|httpie|python-requests|python-urllib|aiohttp|go-http-client|java\/|okhttp|axios|node-fetch|undici|got \(|libwww-perl|lwp::|ruby|php|guzzlehttp|apache-httpclient|httpclient|postmanruntime|insomnia|powershell|winhttp|scrapy)/i, "http-library"],
];

export function detectBot(input: BotCheckInput): BotCheckResult {
  const method = input.method.toUpperCase();
  if (method === "HEAD" || method === "OPTIONS") return { bot: true, reason: "non-get-method" };

  const ua = (input.userAgent ?? "").trim();
  if (ua.length === 0) return { bot: true, reason: "empty-user-agent" };
  if (ua.length < 12) return { bot: true, reason: "short-user-agent" };

  for (const [pattern, reason] of BOT_UA_PATTERNS) {
    if (pattern.test(ua)) return { bot: true, reason };
  }

  const h = input.headers;
  const purpose = `${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""} ${h.get("x-purpose") ?? ""} ${h.get("x-moz") ?? ""}`;
  if (/prefetch|prerender|preview/i.test(purpose)) return { bot: true, reason: "prefetch-header" };

  // Real browsers navigating to a page always say they accept HTML.
  const accept = h.get("accept") ?? "";
  if (accept && !/text\/html|\*\/\*/i.test(accept)) return { bot: true, reason: "non-html-accept" };

  return { bot: false };
}
