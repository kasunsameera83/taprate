import "server-only";
import { env } from "@/lib/env";
import { asStatus, cleanRecords, type DnsRecord, type DomainStatus } from "@/lib/sending/domainRules";

// Our email provider's domain API (Resend). Needs a full-access API key.
type ProviderDomain = { id: string; status: DomainStatus; records: DnsRecord[] };

async function call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const e = env();
  if (!e.RESEND_API_KEY) return { ok: false, status: 503, json: null };
  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

const toDomain = (j: Record<string, unknown> | null): ProviderDomain | null =>
  j && typeof j.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(j.id) ? { id: j.id, status: asStatus(j.status), records: cleanRecords(j.records) } : null;

export async function createProviderDomain(domain: string): Promise<ProviderDomain | { error: string }> {
  const r = await call("POST", "/domains", { name: domain });
  const d = toDomain(r.json);
  if (r.ok && d) return d;
  if (r.status === 403 || r.status === 401) return { error: "The email provider key can't manage domains. Use a full-access Resend API key." };
  if (r.status === 409 || r.status === 422) return { error: "That domain can't be added. It may already be used with another account." };
  return { error: "Couldn't add the domain right now. Try again." };
}

export async function refreshProviderDomain(id: string): Promise<ProviderDomain | null> {
  await call("POST", `/domains/${encodeURIComponent(id)}/verify`);
  const r = await call("GET", `/domains/${encodeURIComponent(id)}`);
  return r.ok ? toDomain(r.json) : null;
}

export async function deleteProviderDomain(id: string): Promise<void> {
  await call("DELETE", `/domains/${encodeURIComponent(id)}`);
}
