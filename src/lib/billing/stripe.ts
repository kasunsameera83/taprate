// Stripe over its REST API (no SDK needed). Pure parts are unit-tested.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the Stripe-Signature header: t=<unix>,v1=<hex hmac>[,v1=...]. HMAC-SHA256 of "<t>.<raw body>"
 * with the endpoint's signing secret; rejects anything older than `toleranceSec` (replays).
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!header || !secret || header.length > 2000) return false;
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v && /^\d{1,12}$/.test(v)) t = Number(v);
    if (k === "v1" && v && /^[0-9a-f]{64}$/.test(v)) sigs.push(v);
  }
  if (t === null || sigs.length === 0 || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex"), "utf8");
  return sigs.some((s) => {
    const b = Buffer.from(s, "utf8");
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

type Params = { [k: string]: string | number | boolean | null | undefined | Params | Array<string | number | Params> };

/** Stripe's form encoding: nested objects and arrays as a[b][0][c]=v. */
export function formEncode(params: Params, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") out.push(formEncode(item, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") out.push(formEncode(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
}

export async function stripeApi<T>(secretKey: string, method: "GET" | "POST" | "DELETE", path: string, params?: Params, idempotencyKey?: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  if (!/^\/v1\/[a-z_/A-Z0-9]+$/.test(path)) throw new Error("invalid Stripe path");
  try {
    const res = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(params && method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: params && method !== "GET" ? formEncode(params) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!res.ok || !json) return { ok: false, status: res.status, message: json?.error?.message ?? "Stripe request failed" };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Stripe" };
  }
}

/** Invoice → subscription id and metadata, across Stripe API versions (the field moved in 2025). */
export function invoiceSubscription(inv: {
  subscription?: string | { id: string } | null;
  subscription_details?: { metadata?: Record<string, string> } | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null; metadata?: Record<string, string> } | null } | null;
}): { subscriptionId: string | null; metadata: Record<string, string> } {
  const raw = inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null;
  const subscriptionId = typeof raw === "string" ? raw : (raw?.id ?? null);
  const metadata = inv.parent?.subscription_details?.metadata ?? inv.subscription_details?.metadata ?? {};
  return { subscriptionId, metadata };
}

/** Period end of an invoice line / subscription, across API versions. */
export function periodEnd(obj: { current_period_end?: number; items?: { data?: Array<{ current_period_end?: number }> } } | null | undefined): string | null {
  const t = obj?.current_period_end ?? obj?.items?.data?.[0]?.current_period_end;
  return typeof t === "number" ? new Date(t * 1000).toISOString() : null;
}
