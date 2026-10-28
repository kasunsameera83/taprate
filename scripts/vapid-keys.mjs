// Makes the keys for phone/desktop alerts. Run once:  node scripts/vapid-keys.mjs
// Put the two values in Vercel as VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (keep the private one secret).
import { createECDH } from "node:crypto";
const e = createECDH("prime256v1");
e.generateKeys();
const d = e.getPrivateKey();
const priv = Buffer.concat([Buffer.alloc(32 - d.length), d]);
console.log(`VAPID_PUBLIC_KEY=${e.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${priv.toString("base64url")}`);
