import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { isUuid } from "@/lib/security/signing";
import { open } from "@/lib/security/secretBox";
import { isShopifyTopic, readShopifyOrder, verifyShopifyHmac } from "@/lib/shopify";
import { processQueue } from "@/lib/sending/server";

// Order notifications from a shop (a webhook the business made in Shopify admin). The address names
// one connection; the notification must be signed with that shop's signing key, come from the shop
// that was connected, and be an order topic we use. Then the customer is emailed the survey through
// the normal sending rules (unsubscribes, bounces, "recently emailed", daily limit, one per day).
// Shopify retries anything that isn't a 2xx, so permanent problems still answer 200.
export const dynamic = "force-dynamic";
const MAX_BYTES = 1024 * 1024; // orders with many items are large; we only read a few fields
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

type Conn = { id: string; account_id: string; url_encrypted: string; secret_encrypted: string | null; survey_id: string | null; enabled: boolean };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.webhookPerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return json({ ok: false }, 429);
  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ ok: false }, 404);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return json({ ok: false }, 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return json({ ok: false }, 413);

  const db = adminClient();
  // Looked up by its own id; everything after this is scoped to the connection's account_id.
  const { data } = await db.from("integrations").select("id, account_id, url_encrypted, secret_encrypted, survey_id, enabled").eq("id", id).eq("kind", "shopify").maybeSingle();
  const conn = data as Conn | null;
  if (!conn) return json({ ok: false }, 404);

  const secret = conn.secret_encrypted ? open(e.RESPONSE_TOKEN_SECRET, conn.secret_encrypted) : null;
  const shop = open(e.RESPONSE_TOKEN_SECRET, conn.url_encrypted);
  // No signing key yet: refuse, and Shopify retries for up to 48 hours (so orders aren't lost while setting up).
  if (!shop) return json({ ok: false }, 500);
  if (!secret) return json({ ok: false, error: "signing key not added yet" }, 401);
  if (!verifyShopifyHmac(secret, raw, req.headers.get("x-shopify-hmac-sha256"))) {
    console.warn("[shopify] rejected webhook (bad signature)", { connection: conn.id });
    return json({ ok: false }, 401);
  }
  // Signed, so it's the shop's own key; also insist on the shop we connected.
  if ((req.headers.get("x-shopify-shop-domain") ?? "").toLowerCase() !== shop) return json({ ok: false, error: "wrong shop" }, 401);

  const mark = (status: "ok" | "failed") =>
    db.from("integrations").update({ last_status: status, last_delivery_at: new Date().toISOString() }).eq("id", conn.id).eq("account_id", conn.account_id);

  if (!conn.enabled) return json({ ok: true, ignored: "switched off" });
  const topic = req.headers.get("x-shopify-topic");
  if (!isShopifyTopic(topic)) return json({ ok: true, ignored: "topic" });
  if (!(await hitRateLimit(LIMITS.shopifyPerConnection, conn.id))) return json({ ok: false }, 429);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: true, ignored: "invalid" });
  }
  const read = readShopifyOrder(body);
  if (!read.ok) {
    // "Send test notification" in Shopify lands here: show the connection as working.
    if (read.reason === "test") await mark("ok");
    return json({ ok: true, ignored: read.reason });
  }

  const row = { email: read.order.email, ...(read.order.name ? { name: read.order.name } : {}), ...(read.order.orderRef ? { ticket: `order-${read.order.orderRef}` } : {}) };
  const { data: sent, error } = await db.rpc("api_send_one", { p_account: conn.account_id, p_survey: conn.survey_id, p_row: row, p_skip_recent_days: 30 });
  if (error) {
    await mark("failed");
    // Not active, suspended, or today's limit: retrying won't help today.
    console.warn("[shopify] not sent", { connection: conn.id, code: error.code });
    return json({ ok: true, sent: false });
  }
  await mark("ok");
  const r = sent as { recipient: string; status: string };
  if (r.status === "queued") {
    after(async () => {
      const { data: rec } = await db.from("send_recipients").select("send_id").eq("id", r.recipient).eq("account_id", conn.account_id).maybeSingle();
      if (rec) await processQueue(db, { sendId: rec.send_id, budgetMs: 8_000 });
    });
  }
  return json({ ok: true, status: r.status });
}
