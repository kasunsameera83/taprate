import "server-only";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { planAllows } from "@/lib/billing/features";
import { requestHost } from "@/lib/surveyDomainRules";

// Survey pages on a business's own web address (Scale). Lookups are cached for a minute per server
// instance, so public pages don't hit the database on every view.
type Entry<T> = { value: T; at: number };
const TTL = 60_000;
const byAccount = new Map<string, Entry<string | null>>();
const byHost = new Map<string, Entry<string | null>>();

async function load(column: "account_id" | "domain", value: string): Promise<{ account: string; domain: string } | null> {
  const db = adminClient();
  const { data } = await db.from("survey_domains").select("account_id, domain").eq(column, value).eq("status", "verified").maybeSingle();
  if (!data) return null;
  const { data: acct } = await db.from("accounts").select("plan, suspended_at").eq("id", data.account_id).maybeSingle();
  if (!acct || acct.suspended_at || !planAllows(acct.plan as string, "custom_domain")) return null;
  return { account: data.account_id as string, domain: data.domain as string };
}

/** The verified survey domain for a business, or null. */
export async function surveyDomainFor(accountId: string): Promise<string | null> {
  const hit = byAccount.get(accountId);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const found = await load("account_id", accountId);
  byAccount.set(accountId, { value: found?.domain ?? null, at: Date.now() });
  return found?.domain ?? null;
}

/** The business a verified survey domain belongs to, or null. */
export async function accountForSurveyDomain(host: string): Promise<string | null> {
  const hit = byHost.get(host);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const found = await load("domain", host);
  byHost.set(host, { value: found?.account ?? null, at: Date.now() });
  return found?.account ?? null;
}

/** Where a business's public survey links should point: its own domain if verified, otherwise ours. */
export async function publicOriginFor(accountId: string): Promise<string> {
  const d = await surveyDomainFor(accountId);
  return d ? `https://${d}` : env().appOrigin;
}

export function isAppHost(host: string): boolean {
  const app = new URL(env().appOrigin).host;
  return host === app || host.endsWith(".vercel.app") || host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

/**
 * Is this request allowed to show this business's survey? Always on our own address; on a custom
 * address only if it belongs to the same business (so nobody can show another business's survey on theirs).
 */
export async function hostAllowedFor(headers: { get(name: string): string | null }, accountId: string): Promise<boolean> {
  const host = requestHost(headers);
  if (!host || isAppHost(host)) return true;
  return (await accountForSurveyDomain(host)) === accountId;
}

/** For public API calls made from a custom survey page: same-origin on that host, and the host is ours. */
export async function isSurveyDomainSameOrigin(headers: { get(name: string): string | null }): Promise<boolean> {
  const host = requestHost(headers);
  if (!host || isAppHost(host)) return false;
  const source = headers.get("origin") ?? headers.get("referer");
  if (!source) return false;
  let originHost: string;
  try {
    const u = new URL(source);
    if (u.protocol !== "https:") return false;
    originHost = u.host.toLowerCase();
  } catch {
    return false;
  }
  return originHost === host && (await accountForSurveyDomain(host)) !== null;
}

// ---------------------------------------------------------------------------
// Hosting provider (Vercel): attach the domain to this project so it gets HTTPS and reaches us.
// ---------------------------------------------------------------------------

export function hostingConfigured(): boolean {
  const e = env();
  return Boolean(e.VERCEL_API_TOKEN && e.VERCEL_PROJECT_ID);
}

async function vercel(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const e = env();
  const team = e.VERCEL_TEAM_ID ? `${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(e.VERCEL_TEAM_ID)}` : "";
  try {
    const res = await fetch(`https://api.vercel.com${path}${team}`, {
      ...init,
      headers: { Authorization: `Bearer ${e.VERCEL_API_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

export type DnsRecord = { type: string; name: string; value: string };

/** DNS records the business must add: a CNAME to us, plus any ownership TXT the provider asks for. */
function recordsFrom(domain: string, data: Record<string, unknown>): DnsRecord[] {
  const sub = domain.split(".").slice(0, -2).join(".") || domain;
  const out: DnsRecord[] = [{ type: "CNAME", name: sub, value: "cname.vercel-dns.com" }];
  const v = Array.isArray(data.verification) ? (data.verification as Array<Record<string, unknown>>) : [];
  for (const r of v.slice(0, 3)) {
    if (typeof r.type === "string" && typeof r.domain === "string" && typeof r.value === "string" && r.value.length < 300) {
      out.push({ type: r.type.toUpperCase(), name: r.domain, value: r.value });
    }
  }
  return out;
}

export async function addHostingDomain(domain: string): Promise<{ ok: boolean; records: DnsRecord[]; message?: string }> {
  const e = env();
  const res = await vercel(`/v10/projects/${encodeURIComponent(e.VERCEL_PROJECT_ID!)}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
  if (!res.ok && res.status !== 409) {
    const err = (res.data.error ?? {}) as { code?: string };
    return { ok: false, records: [], message: err.code === "domain_already_in_use" ? "That address is already used by another website." : "Couldn't add the address. Check it and try again." };
  }
  const info = await vercel(`/v9/projects/${encodeURIComponent(e.VERCEL_PROJECT_ID!)}/domains/${encodeURIComponent(domain)}`);
  return { ok: true, records: recordsFrom(domain, info.data) };
}

export async function checkHostingDomain(domain: string): Promise<{ verified: boolean; records: DnsRecord[] }> {
  const e = env();
  const project = encodeURIComponent(e.VERCEL_PROJECT_ID!);
  let info = await vercel(`/v9/projects/${project}/domains/${encodeURIComponent(domain)}`);
  if (info.ok && info.data.verified === false) {
    await vercel(`/v9/projects/${project}/domains/${encodeURIComponent(domain)}/verify`, { method: "POST" });
    info = await vercel(`/v9/projects/${project}/domains/${encodeURIComponent(domain)}`);
  }
  const config = await vercel(`/v6/domains/${encodeURIComponent(domain)}/config`);
  const verified = info.ok && info.data.verified === true && config.ok && config.data.misconfigured === false;
  return { verified, records: recordsFrom(domain, info.data) };
}

export async function removeHostingDomain(domain: string): Promise<void> {
  const e = env();
  await vercel(`/v9/projects/${encodeURIComponent(e.VERCEL_PROJECT_ID!)}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
}

/** Forget cached lookups after a change (this server instance; others refresh within a minute). */
export function clearSurveyDomainCache(accountId: string, domain?: string | null) {
  byAccount.delete(accountId);
  if (domain) byHost.delete(domain);
}

/**
 * For public survey pages (server components): if this page was opened on a custom web address that
 * doesn't belong to this business, send the visitor to the same page on our own address instead.
 */
export async function enforceSurveyHost(accountId: string, path: string): Promise<void> {
  const { headers } = await import("next/headers");
  const h = await headers();
  if (await hostAllowedFor(h, accountId)) return;
  const { redirect } = await import("next/navigation");
  redirect(`${env().appOrigin}${path.startsWith("/") ? path : `/${path}`}`);
}
