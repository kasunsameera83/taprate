// Web Push without extra packages: VAPID sign-in (RFC 8292) and message encryption (RFC 8291, aes128gcm).
// Pure node:crypto, unit-tested with a round trip. Only known browser push services are ever contacted.
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

/** Push services run by browser makers. Anything else is refused (no requests to arbitrary hosts). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9.-]+\.push\.apple\.com$/];

export function isPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 1000) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** A browser's subscription keys: p256dh = 65-byte uncompressed P-256 point, auth = 16 bytes. */
export function validKeys(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== "string" || typeof auth !== "string" || !/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) return false;
  const p = fromB64u(p256dh);
  return p.length === 65 && p[0] === 0x04 && fromB64u(auth).length === 16;
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length);
}

/** Encrypts one message for one subscription (single record, RFC 8188 aes128gcm). */
export function encryptPayload(payload: Buffer, p256dh: string, auth: string, opts: { salt?: Buffer; serverKeys?: { privateKey: Buffer; publicKey: Buffer } } = {}): Buffer {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const ecdh = createECDH("prime256v1");
  if (opts.serverKeys) ecdh.setPrivateKey(opts.serverKeys.privateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32);
  const salt = opts.salt ?? randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/** The VAPID private key (32 bytes, base64url) as a signing key, using the public key for x/y. */
export function vapidKey(publicKey: string, privateKey: string): KeyObject {
  const pub = fromB64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4 || fromB64u(privateKey).length !== 32) throw new Error("invalid VAPID keys");
  return createPrivateKey({ key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
}

export function vapidAuthorization(endpoint: string, subject: string, publicKey: string, key: KeyObject, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const aud = new URL(endpoint).origin;
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: nowSeconds + 12 * 3600, sub: subject })));
  const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${publicKey}`;
}

/** New VAPID keys (run once: node scripts/vapid-keys.mjs). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const e = createECDH("prime256v1");
  e.generateKeys();
  const d = e.getPrivateKey();
  const padded = Buffer.concat([Buffer.alloc(32 - d.length), d]); // always 32 bytes
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(padded) };
}
