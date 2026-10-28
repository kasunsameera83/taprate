// Shopify: the shop sends us an order notification (a webhook made in Shopify admin → Settings →
// Notifications → Webhooks), signed with the shop's webhook signing key. We check the signature, read
// only the customer's email, first name and order number, and email them the survey. Pure, unit-tested.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Orders we act on. "Order fulfillment" is the usual choice (sent when the order ships). */
export const SHOPIFY_TOPICS = ["orders/fulfilled", "orders/paid", "orders/create"] as const;
export type ShopifyTopic = (typeof SHOPIFY_TOPICS)[number];

export const SHOP_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;

/** Accepts "acme", "acme.myshopify.com" or "https://acme.myshopify.com/admin"; returns acme.myshopify.com or null. */
export function normalizeShopDomain(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (v.length > 200) return null;
  v = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!v.includes(".")) v = `${v}.myshopify.com`;
  return SHOP_DOMAIN.test(v) ? v : null;
}

/** X-Shopify-Hmac-Sha256: base64 HMAC-SHA256 of the exact raw body, compared in constant time. */
export function verifyShopifyHmac(secret: string, rawBody: string, header: string | null): boolean {
  if (!secret || !header || header.length > 200 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
// Reserved for examples: Shopify's "Send test notification" uses addresses like these. Never email them.
const EXAMPLE = /@(?:[a-z0-9-]+\.)*example\.(?:com|net|org)$/;

export type ShopifyOrder = { email: string; name: string | null; orderRef: string | null };

/**
 * The few fields we use from an order. Everything else in the notification (address, items, payment)
 * is ignored and never stored. Returns why an order was skipped instead of throwing.
 */
export function readShopifyOrder(json: unknown): { ok: true; order: ShopifyOrder } | { ok: false; reason: "no_email" | "test" | "invalid" } {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, reason: "invalid" };
  const o = json as { email?: unknown; contact_email?: unknown; test?: unknown; name?: unknown; order_number?: unknown; customer?: { first_name?: unknown; email?: unknown } | null; buyer_accepts_marketing?: unknown };
  const raw = [o.email, o.contact_email, o.customer?.email].find((v) => typeof v === "string" && v.trim() !== "");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL.test(email)) return { ok: false, reason: "no_email" };
  if (o.test === true || EXAMPLE.test(email)) return { ok: false, reason: "test" };
  const first = typeof o.customer?.first_name === "string" ? o.customer.first_name.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 60) : "";
  const num = typeof o.order_number === "number" && Number.isInteger(o.order_number) && o.order_number > 0 ? String(o.order_number) : typeof o.name === "string" ? o.name.replace(/[^0-9]/g, "").slice(0, 15) : "";
  return { ok: true, order: { email, name: first || null, orderRef: num || null } };
}

export function isShopifyTopic(v: string | null): v is ShopifyTopic {
  return v !== null && (SHOPIFY_TOPICS as readonly string[]).includes(v);
}
