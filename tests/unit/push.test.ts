import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createECDH, createHmac, randomBytes, verify, createPublicKey } from "node:crypto";
import { encryptPayload, generateVapidKeys, isPushEndpoint, validKeys, vapidAuthorization, vapidKey } from "../../src/lib/push/webpush.ts";

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, len: number) {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}

test("push: a browser can decrypt what we send (RFC 8291 round trip)", () => {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  const p256dh = ua.getPublicKey().toString("base64url");
  const msg = Buffer.from(JSON.stringify({ title: "Unhappy customer", body: "Very poor on Support" }));
  const out = encryptPayload(msg, p256dh, auth.toString("base64url"));
  const salt = out.subarray(0, 16);
  assert.equal(out.readUInt32BE(16), 4096);
  const idlen = out[20]!;
  const asPublic = out.subarray(21, 21 + idlen);
  const body = out.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(body.subarray(body.length - 16));
  const plain = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2);
  assert.deepEqual(plain.subarray(0, -1), msg);
});

test("push: VAPID token is a valid ES256 signature for the push service", () => {
  const keys = generateVapidKeys();
  const key = vapidKey(keys.publicKey, keys.privateKey);
  const h = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", "mailto:hello@taprate.lk", keys.publicKey, key, 1_800_000_000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m);
  const claims = JSON.parse(Buffer.from(m![2]!, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "mailto:hello@taprate.lk");
  const pub = Buffer.from(keys.publicKey, "base64url");
  const jwk = { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") };
  const ok = verify("sha256", Buffer.from(`${m![1]}.${m![2]}`), { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, Buffer.from(m![3]!, "base64url"));
  assert.equal(ok, true);
});

test("push: only browser push services, only well-formed keys", () => {
  assert.equal(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x"), true);
  assert.equal(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(isPushEndpoint("https://web.push.apple.com/x"), true);
  assert.equal(isPushEndpoint("https://wns2-by3p.notify.windows.com/w/?token=x"), true);
  assert.equal(isPushEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(isPushEndpoint("https://169.254.169.254/latest"), false);
  assert.equal(isPushEndpoint("https://fcm.googleapis.com.evil.com/x"), false);
  assert.equal(isPushEndpoint("https://fcm.googleapis.com:8443/x"), false);
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  assert.equal(validKeys(ua.getPublicKey().toString("base64url"), randomBytes(16).toString("base64url")), true);
  assert.equal(validKeys("abc", randomBytes(16).toString("base64url")), false);
});
