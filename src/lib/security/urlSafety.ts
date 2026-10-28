// Outgoing requests to user-supplied URLs (Slack, Teams, webhooks) must not be able to reach our own
// network, cloud metadata or localhost (SSRF). Checked when saving AND again right before sending.
// Pure functions, unit-tested; the DNS check lives in integrations.ts.

export type IntegrationKind = "slack" | "teams" | "webhook" | "zendesk" | "freshdesk" | "gorgias" | "intercom" | "front" | "shopify";
/** Helpdesks we add rating notes to. (Shopify only sends to us; we never send to it.) */
export type HelpdeskKind = "zendesk" | "freshdesk" | "gorgias" | "intercom" | "front";
export const isHelpdesk = (k: IntegrationKind): k is HelpdeskKind => k === "zendesk" || k === "freshdesk" || k === "gorgias" || k === "intercom" || k === "front";
/** Intercom's API hosts for its US, EU and Australian data centres. */
export const INTERCOM_HOSTS = { us: "api.intercom.io", eu: "api.eu.intercom.io", au: "api.au.intercom.io" } as const;
/** Front's API host (the same for every Front account). */
export const FRONT_HOST = "api2.frontapp.com";

const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".intranet"];
const TEAMS_HOSTS = [".webhook.office.com", ".logic.azure.com", ".powerplatform.com", ".environment.api.powerplatform.com"];

export function checkIntegrationUrl(kind: IntegrationKind, raw: string): { ok: true; url: URL; hint: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Enter a valid URL." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "The URL must start with https://" };
  if (url.username || url.password) return { ok: false, reason: "The URL can't contain a username or password." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Only the standard https port is allowed." };
  const host = url.hostname.toLowerCase();
  if (isIpLiteral(host)) return { ok: false, reason: "Use a domain name, not an IP address." };
  if (host === "localhost" || !host.includes(".") || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "That address isn't reachable from the internet." };
  }
  if (kind === "slack" && host !== "hooks.slack.com") return { ok: false, reason: "Slack webhook URLs start with https://hooks.slack.com/" };
  if (kind === "teams" && !TEAMS_HOSTS.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Use the webhook URL from a Teams workflow (…webhook.office.com, …logic.azure.com or …powerplatform.com)." };
  }
  if (kind === "zendesk" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.zendesk\.com$/.test(host)) return { ok: false, reason: "Use your Zendesk address, like acme.zendesk.com." };
  if (kind === "freshdesk" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.freshdesk\.com$/.test(host)) return { ok: false, reason: "Use your Freshdesk address, like acme.freshdesk.com." };
  if (kind === "gorgias" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.gorgias\.com$/.test(host)) return { ok: false, reason: "Use your Gorgias address, like acme.gorgias.com." };
  if (kind === "intercom" && !(Object.values(INTERCOM_HOSTS) as string[]).includes(host)) return { ok: false, reason: "Choose your Intercom region." };
  if (kind === "front" && host !== FRONT_HOST) return { ok: false, reason: "Front connections always use api2.frontapp.com." };
  if (kind === "shopify") return { ok: false, reason: "TapTruly never sends requests to Shopify." };
  if (raw.length > 1000) return { ok: false, reason: "That URL is too long." };
  const last4 = url.pathname.replace(/\/+$/, "").slice(-4);
  return { ok: true, url, hint: `${host}/…${last4}` };
}

export function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host);
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast, reserved and cloud-metadata ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}
