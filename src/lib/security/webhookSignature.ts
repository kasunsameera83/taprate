import { createHmac, timingSafeEqual } from "node:crypto";

/** Header value for signed webhooks: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">. */
export function signWebhook(secret: string, body: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac("sha256", secret).update(`${nowSeconds}.${body}`).digest("hex");
  return `t=${nowSeconds},v1=${sig}`;
}

/** Reference verifier (what a receiver should do): checks the signature and rejects old events. */
export function verifyWebhook(secret: string, body: string, header: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!m || !m[1] || !m[2]) return false;
  const t = Number(m[1]);
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
