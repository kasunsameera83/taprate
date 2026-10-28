// Checks webhook signatures in the Svix format (used by Resend): HMAC-SHA256 over
// "<id>.<timestamp>.<raw body>" with the base64 secret after "whsec_". Pure, unit-tested.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export function signSvix(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`, "utf8").digest("base64");
}

export function verifySvixSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !/^\d{10}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SVIX_TOLERANCE_SECONDS) return false; // replay window
  const expected = Buffer.from(signSvix(secret, id, timestamp, body), "utf8");
  let ok = false;
  for (const part of signature.split(" ").slice(0, 10)) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "utf8");
    if (given.length === expected.length && timingSafeEqual(given, expected)) ok = true;
  }
  return ok;
}
