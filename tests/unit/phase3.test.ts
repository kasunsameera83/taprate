import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { seal, open } from "../../src/lib/security/secretBox.ts";
import { checkIntegrationUrl, isPrivateAddress } from "../../src/lib/security/urlSafety.ts";
import { buildShareToken, verifyShareToken, parseKioskToken } from "../../src/lib/security/signing.ts";
import { encodeQr, qrSvg } from "../../src/lib/qr.ts";

const MASTER = "master-secret-0123456789-abcdefghijklmnopqrst";
const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const SURVEY = "5a000000-0000-4000-8000-000000000001";

test("integration secrets: encrypted, tamper-evident, key-bound", () => {
  const url = "https://hooks.slack.com/services/T000/B000/XXXXXXXX";
  const box = seal(MASTER, url);
  assert.ok(!box.includes("hooks.slack.com"), "ciphertext doesn't reveal the URL");
  assert.notEqual(seal(MASTER, url), box, "random IV each time");
  assert.equal(open(MASTER, box), url);
  assert.equal(open("another-secret-0123456789-abcdefghijklmn", box), null, "wrong key");
  const parts = box.split(".");
  parts[2] = parts[2]!.slice(0, -2) + (parts[2]!.endsWith("A") ? "BB" : "AA");
  assert.equal(open(MASTER, parts.join(".")), null, "tampered ciphertext rejected");
  assert.equal(open(MASTER, "garbage"), null);
});

test("integration URLs: only https public hosts, and the right provider", () => {
  assert.equal(checkIntegrationUrl("slack", "https://hooks.slack.com/services/T/B/x").ok, true);
  assert.equal(checkIntegrationUrl("slack", "https://evil.example/services/T/B/x").ok, false, "slack must be hooks.slack.com");
  assert.equal(checkIntegrationUrl("teams", "https://acme.webhook.office.com/webhookb2/abc").ok, true);
  assert.equal(checkIntegrationUrl("teams", "https://prod-12.westus.logic.azure.com:443/workflows/abc").ok, true);
  assert.equal(checkIntegrationUrl("teams", "https://example.com/hook").ok, false);
  assert.equal(checkIntegrationUrl("webhook", "https://api.example.com/hooks/taprate").ok, true);
  for (const bad of [
    "http://api.example.com/hook",
    "https://127.0.0.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://localhost/hook",
    "https://printer.local/hook",
    "https://db.internal/hook",
    "https://intranet/hook",
    "https://user:pass@api.example.com/hook",
    "https://api.example.com:8443/hook",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "not a url",
  ]) {
    assert.equal(checkIntegrationUrl("webhook", bad).ok, false, bad);
  }
  const ok = checkIntegrationUrl("slack", "https://hooks.slack.com/services/T/B/abcd1234");
  assert.ok(ok.ok && ok.hint === "hooks.slack.com/…1234", "hint never shows the full secret URL");
});

test("private network addresses are recognised (checked again at send time)", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "203.94.1.1", "2606:4700:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);
});

test("share links are signed per survey", () => {
  const t = buildShareToken(SECRET, SURVEY);
  assert.equal(verifyShareToken([SECRET], t), SURVEY);
  assert.equal(verifyShareToken([SECRET], t.replace("0001.", "0002.")), null, "another survey id with the same signature");
  assert.equal(verifyShareToken(["other-secret-0123456789-abcdefghijklmno"], t), null);
  assert.equal(verifyShareToken([SECRET], `${SURVEY}.short`), null);
  assert.equal(verifyShareToken([SECRET], "../../etc"), null);
});

test("kiosk tokens: strict format", () => {
  const ok = parseKioskToken(`9a000000-0000-4000-8000-000000000009.${"a".repeat(43)}`);
  assert.ok(ok && ok.secret.length === 43);
  assert.equal(parseKioskToken(`9a000000-0000-4000-8000-000000000009.${"a".repeat(42)}`), null);
  assert.equal(parseKioskToken(`not-a-uuid.${"a".repeat(43)}`), null);
  assert.equal(parseKioskToken(`9a000000-0000-4000-8000-000000000009.${"a".repeat(40)}%2F%2F`), null);
});

test("webhook signatures can be verified by the receiver", async () => {
  const { signWebhook, verifyWebhook } = await import("../../src/lib/security/webhookSignature.ts");
  const body = JSON.stringify({ event: "rating.created", id: "x" });
  const t = 1_800_000_000;
  const header = signWebhook("whsec_test", body, t);
  assert.equal(header, `t=${t},v1=${createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex")}`);
  assert.equal(verifyWebhook("whsec_test", body, header, t + 10), true);
  assert.equal(verifyWebhook("whsec_other", body, header, t + 10), false, "wrong secret");
  assert.equal(verifyWebhook("whsec_test", body + " ", header, t + 10), false, "body changed");
  assert.equal(verifyWebhook("whsec_test", body, header, t + 3600), false, "replayed later");
  assert.equal(verifyWebhook("whsec_test", body, "t=1,v1=zz", t), false);
});

test("QR codes: structure and SVG output", () => {
  const g = encodeQr("https://app.example/s/x?c=qr");
  assert.equal(g.length % 4, 1, "size is 4n+17");
  assert.equal(g.length, g[0]!.length);
  // Finder patterns in three corners (dark 7x7 outer ring).
  for (const [x, y] of [[0, 0], [g.length - 7, 0], [0, g.length - 7]] as const) {
    assert.equal(g[y]![x], true);
    assert.equal(g[y + 6]![x + 6], true);
    assert.equal(g[y + 1]![x + 1], false);
    assert.equal(g[y + 3]![x + 3], true);
  }
  const svg = qrSvg("hello", { title: "<script>x</script>" });
  assert.ok(svg.startsWith("<svg") && !svg.includes("<script>"), "title is sanitised");
  assert.throws(() => encodeQr("x".repeat(400)), /too long/);
});
