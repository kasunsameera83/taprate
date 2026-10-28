// Encrypts integration secrets (Slack/Teams webhook URLs, signing secrets) before they're stored.
// AES-256-GCM with a key derived from RESPONSE_TOKEN_SECRET via HKDF. Pure (node:crypto), unit-tested.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key(masterSecret: string): Buffer {
  if (!masterSecret || masterSecret.length < 32) throw new Error("encryption secret missing or too short");
  // "taprate" is the product's original name. Keep it: changing it would make every saved integration secret unreadable.
  return Buffer.from(hkdfSync("sha256", masterSecret, "taprate", "integrations:v1", 32));
}

export function seal(masterSecret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(masterSecret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function open(masterSecret: string, sealed: string): string | null {
  const m = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)\.([A-Za-z0-9_-]+)$/.exec(sealed);
  if (!m || !m[1] || m[2] === undefined || !m[3]) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(masterSecret), Buffer.from(m[1], "base64url"));
    decipher.setAuthTag(Buffer.from(m[3], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(m[2], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null; // tampered or wrong key
  }
}
