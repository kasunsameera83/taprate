// API keys for the public API. Pure (node:crypto only), unit-tested.
//
// Format:  tr_<key id, 32 hex>_<secret, 43 chars base64url = 256 random bits>
// Only sha256(secret) is stored. The key id lets us find the row without scanning; the secret is
// compared in constant time. A leaked database therefore can't be used to call the API.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_RE = /^tr_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/;

export function newApiKeySecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: hashApiKeySecret(secret) };
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(`apikey:v1|${secret}`, "utf8").digest("hex");
}

export function formatApiKey(keyId: string, secret: string): string {
  return `tr_${keyId.replace(/-/g, "")}_${secret}`;
}

/** Shown in the dashboard so people can tell keys apart. Never enough to use the key. */
export function apiKeyHint(keyId: string): string {
  return `tr_${keyId.replace(/-/g, "").slice(0, 8)}…`;
}

export function parseApiKey(raw: string | null | undefined): { keyId: string; secret: string } | null {
  if (typeof raw !== "string" || raw.length > 120) return null;
  const m = KEY_RE.exec(raw.trim());
  if (!m || !m[1] || !m[2]) return null;
  const h = m[1];
  const keyId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { keyId, secret: m[2] };
}

/** Reads "Authorization: Bearer <key>". Keys in the URL are refused (they end up in logs). */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}

export function secretMatches(storedHash: string, secret: string): boolean {
  const a = Buffer.from(storedHash, "utf8");
  const b = Buffer.from(hashApiKeySecret(secret), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ApiScope = "read" | "write";

export function keyIsUsable(row: { revoked_at: string | null; expires_at: string | null }, nowMs = Date.now()): boolean {
  if (row.revoked_at) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= nowMs) return false;
  return true;
}
