import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildCheckRequest,
  buildNoteRequest,
  checkResponseOk,
  helpdeskBaseUrl,
  helpdeskCredential,
  intercomAdminId,
  intercomBaseUrl,
  intercomNoteRequest,
  intercomSearchRequest,
  latestIntercomConversation,
  noteText,
} from "../../src/lib/helpdesk.ts";
import { checkIntegrationUrl } from "../../src/lib/security/urlSafety.ts";
import { helpdeskCreateSchema, shopifyCreateSchema } from "../../src/lib/validation/schemas.ts";
import { isShopifyTopic, normalizeShopDomain, readShopifyOrder, verifyShopifyHmac } from "../../src/lib/shopify.ts";

const base = { ratingLabel: "Poor", rating: 2, sentiment: "negative" as const, surveyName: "Support", agent: "Nimal", link: "https://app/x" };

test("gorgias: own domain only, internal note as the API user, customer HTML escaped", () => {
  assert.equal(helpdeskBaseUrl("gorgias", "acme"), "https://acme.gorgias.com");
  assert.equal(checkIntegrationUrl("gorgias", "https://acme.gorgias.com").ok, true);
  assert.equal(checkIntegrationUrl("gorgias", "https://acme.gorgias.com.evil.io").ok, false);
  const cred = helpdeskCredential({ kind: "gorgias", email: "ops@shop.lk", apiKey: "KEY123" });
  const req = buildNoteRequest("gorgias", "https://acme.gorgias.com", cred, "1042", noteText({ ...base, comment: "<script>x</script>" }, "comment"));
  assert.equal(req.url, "https://acme.gorgias.com/api/tickets/1042/messages");
  assert.equal(req.headers.Authorization, `Basic ${Buffer.from("ops@shop.lk:KEY123").toString("base64")}`);
  const body = JSON.parse(req.body!) as { channel: string; from_agent: boolean; sender: { email: string }; body_html: string };
  assert.equal(body.channel, "internal-note");
  assert.equal(body.from_agent, true);
  assert.equal(body.sender.email, "ops@shop.lk");
  assert.ok(!body.body_html.includes("<script>"));
  assert.throws(() => buildNoteRequest("gorgias", "https://acme.gorgias.com", cred, "1/../2", "x"));
  assert.equal(buildCheckRequest("gorgias", "https://acme.gorgias.com", cred).url, "https://acme.gorgias.com/api/account");
  const ok = helpdeskCreateSchema.safeParse({ kind: "gorgias", name: "G", subdomain: "Acme", email: "ops@shop.lk", apiKey: "a".repeat(40), events: ["negative"] });
  assert.equal(ok.success, true);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "gorgias", name: "G", subdomain: "acme", email: "ops@shop.lk", apiKey: "bad key with spaces!!", events: ["negative"] }).success, false);
});

test("intercom: fixed regional hosts, note as admin, latest conversation picked", () => {
  assert.equal(intercomBaseUrl("eu"), "https://api.eu.intercom.io");
  assert.equal(checkIntegrationUrl("intercom", "https://api.intercom.io/me").ok, true);
  assert.equal(checkIntegrationUrl("intercom", "https://api.intercom.io.evil.com").ok, false);
  assert.equal(checkIntegrationUrl("intercom", "https://evil.intercom.io").ok, false);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "intercom", name: "I", region: "mars", accessToken: "t".repeat(40), events: ["all"] }).success, false);
  assert.equal(helpdeskCreateSchema.safeParse({ kind: "intercom", name: "I", region: "eu", accessToken: "dG9rOmFiY2RlZmdoaWprbG1ub3A=", events: ["all"] }).success, true);

  assert.equal(intercomAdminId({ type: "admin", id: "991" }), "991");
  assert.equal(intercomAdminId({ type: "admin", id: 991 }), "991");
  assert.equal(intercomAdminId({ type: "user", id: "991" }), null);
  assert.equal(intercomAdminId({ type: "admin", id: "../x" }), null);
  assert.equal(checkResponseOk("intercom", 200, { type: "admin", id: "1" }), true);
  assert.equal(checkResponseOk("intercom", 200, {}), false);

  const s = intercomSearchRequest("https://api.intercom.io", "TOK", "kasun@shop.lk", 1_800_000_000);
  assert.equal(s.headers.Authorization, "Bearer TOK");
  assert.ok(s.headers["Intercom-Version"]);
  assert.match(s.body!, /source\.author\.email/);
  assert.throws(() => intercomSearchRequest("https://api.intercom.io", "TOK", "not an email", 0));

  assert.equal(latestIntercomConversation({ conversations: [{ id: "10", updated_at: 5 }, { id: "12", updated_at: 9 }, { id: "x/../y", updated_at: 99 }] }), "12");
  assert.equal(latestIntercomConversation({ conversations: [] }), null);
  assert.equal(latestIntercomConversation(null), null);

  const n = intercomNoteRequest("https://api.intercom.io", "TOK", "12", "991", noteText({ ...base, comment: "<b>hi</b>" }, "comment"));
  assert.equal(n.url, "https://api.intercom.io/conversations/12/reply");
  const nb = JSON.parse(n.body!) as { message_type: string; type: string; admin_id: string; body: string };
  assert.deepEqual([nb.message_type, nb.type, nb.admin_id], ["note", "admin", "991"]);
  assert.ok(!nb.body.includes("<b>"));
  assert.throws(() => intercomNoteRequest("https://api.intercom.io", "TOK", "12/../me", "991", "x"));
  assert.match(noteText(base, "rating", "customer"), /this customer rated you/);
});

test("shopify: signatures checked in constant time over the exact body", () => {
  const secret = "shpss_0123456789abcdef";
  const body = '{"email":"a@b.lk"}';
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  assert.equal(verifyShopifyHmac(secret, body, sig), true);
  assert.equal(verifyShopifyHmac(secret, body + " ", sig), false, "any change breaks it");
  assert.equal(verifyShopifyHmac("other-secret-0123456", body, sig), false);
  assert.equal(verifyShopifyHmac(secret, body, null), false);
  assert.equal(verifyShopifyHmac(secret, body, "not base64!"), false);
  assert.equal(verifyShopifyHmac("", body, sig), false);
});

test("shopify: only the few order fields we need, test orders never emailed", () => {
  const r = readShopifyOrder({ email: " Kasun@Shop.LK ", order_number: 1001, customer: { first_name: "Kasun<script>" }, shipping_address: { address1: "secret" } });
  assert.deepEqual(r, { ok: true, order: { email: "kasun@shop.lk", name: "Kasunscript", orderRef: "1001" } });
  assert.deepEqual(readShopifyOrder({ email: "jon@example.com" }), { ok: false, reason: "test" });
  assert.deepEqual(readShopifyOrder({ email: "a@b.lk", test: true }), { ok: false, reason: "test" });
  assert.deepEqual(readShopifyOrder({ email: "" }), { ok: false, reason: "no_email" });
  assert.deepEqual(readShopifyOrder({ email: "bad@@x" }), { ok: false, reason: "no_email" });
  assert.deepEqual(readShopifyOrder([1, 2]), { ok: false, reason: "invalid" });
  assert.equal(readShopifyOrder({ contact_email: "c@d.lk", name: "#2002" }).ok && (readShopifyOrder({ contact_email: "c@d.lk", name: "#2002" }) as { order: { orderRef: string } }).order.orderRef, "2002");
  assert.equal(isShopifyTopic("orders/fulfilled"), true);
  assert.equal(isShopifyTopic("customers/redact"), false);
  assert.equal(isShopifyTopic(null), false);
});

test("shopify: shop address and signing key validated", () => {
  assert.equal(normalizeShopDomain("Acme"), "acme.myshopify.com");
  assert.equal(normalizeShopDomain("https://acme.myshopify.com/admin"), "acme.myshopify.com");
  assert.equal(normalizeShopDomain("acme.myshopify.com.evil.io"), null);
  assert.equal(normalizeShopDomain("evil.com"), null);
  const ok = shopifyCreateSchema.safeParse({ name: "Shop", shop: "https://Acme.myshopify.com/admin", signingSecret: "a".repeat(64), surveyId: "0f1e2d3c-4b5a-4968-8776-655443322110" });
  assert.equal(ok.success && ok.data.shop, "acme.myshopify.com");
  assert.equal(shopifyCreateSchema.safeParse({ name: "Shop", shop: "acme.com", signingSecret: "a".repeat(64), surveyId: "0f1e2d3c-4b5a-4968-8776-655443322110" }).success, false);
  assert.equal(shopifyCreateSchema.safeParse({ name: "Shop", shop: "acme", signingSecret: "short", surveyId: "0f1e2d3c-4b5a-4968-8776-655443322110" }).success, false);
  assert.equal(shopifyCreateSchema.safeParse({ name: "Shop", shop: "acme", signingSecret: "a".repeat(64), surveyId: "0f1e2d3c-4b5a-4968-8776-655443322110", extra: 1 }).success, false);
  assert.equal(checkIntegrationUrl("shopify", "https://acme.myshopify.com").ok, false, "we never send to Shopify");
});
