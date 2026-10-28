import { rewardReferral } from "@/lib/referrals/server";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { verifyPayhereNotify } from "@/lib/billing/payhere";
import { eventSeen, orderById, recordEvent } from "@/lib/billing/server";
import { audit } from "@/lib/audit";

// PayHere payment notifications (server-to-server). Not a browser endpoint, so there's no session or
// CSRF check; instead EVERYTHING is proven by the notification itself:
//   size + content type -> our merchant id -> md5sig signature (constant-time) -> the order exists, is a
//   PayHere order, and the amount/currency match it exactly (checked again in the database) ->
//   each PayHere payment is applied once.
export const dynamic = "force-dynamic";
const MAX_BYTES = 16 * 1024;

const done = (text = "ok", status = 200) => new NextResponse(text, { status, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.webhookPerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return done("rate limited", 429);
  if (!e.PAYHERE_MERCHANT_ID || !e.PAYHERE_MERCHANT_SECRET) return done("not configured", 503);
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) return done("bad request", 400);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return done("too large", 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return done("too large", 413);

  const n = verifyPayhereNotify(new URLSearchParams(raw), e.PAYHERE_MERCHANT_ID, e.PAYHERE_MERCHANT_SECRET);
  if (!n) {
    console.warn("[payhere] rejected notification (bad signature or fields)");
    return done("invalid", 400);
  }

  const eventId = `${n.orderId}:${n.paymentId ?? "-"}:${n.statusCode}:${n.messageType ?? "-"}`;
  if (await eventSeen("payhere", eventId)) return done();

  const order = await orderById(n.orderId);
  if (!order || order.provider !== "payhere") {
    await recordEvent("payhere", eventId, n.messageType ?? "notify", null, "unknown order");
    return done();
  }

  const db = adminClient();
  let outcome = "ignored";
  const type = n.messageType ?? "";

  if (n.statusCode === 2 && type !== "RECURRING_STOPPED" && type !== "RECURRING_COMPLETE") {
    if (!n.paymentId || (order.kind === "plan" && !n.subscriptionId)) outcome = "rejected: missing ids";
    else {
      const { data, error } = await db.rpc("billing_record_payment", {
        p_order: order.id,
        p_provider: "payhere",
        p_payment_id: n.paymentId,
        p_amount_minor: n.amountMinor,
        p_currency: n.currency,
        p_sub_ref: order.kind === "plan" ? n.subscriptionId : null,
        p_period_end: n.nextDate ? `${n.nextDate}T23:59:59Z` : null,
      });
      if (error) {
        // A mismatch is permanent: record it and stop. Anything else may be temporary: ask PayHere to retry.
        if (/mismatch|unknown order|required/.test(error.message ?? "")) outcome = `rejected: ${error.message}`.slice(0, 80);
        else {
          console.error("[payhere] could not record payment", { code: error.code });
          return done("retry", 500);
        }
      } else outcome = String(data);
      if (outcome === "granted") {
        await audit({ accountId: order.account_id, userId: null, action: "billing.paid", targetType: "order", targetId: order.id, metadata: { provider: "payhere" } });
        await rewardReferral(order.account_id);
      }
    }
  } else if (n.statusCode === -3) {
    const { data } = await db.rpc("billing_reverse_payment", { p_provider: "payhere", p_payment_id: n.paymentId ?? "" });
    outcome = `chargeback: ${String(data)}`;
  } else if (type === "RECURRING_STOPPED" || type === "RECURRING_COMPLETE" || n.recStatus === -1) {
    if (n.subscriptionId) {
      const { data } = await db.rpc("billing_subscription_update", { p_provider: "payhere", p_sub_ref: n.subscriptionId, p_status: "ended", p_cancel_at_period_end: null, p_period_end: null });
      outcome = `ended: ${String(data)}`;
    }
  } else if (type === "RECURRING_INSTALLMENT_FAILED") {
    if (n.subscriptionId) {
      await db.rpc("billing_subscription_update", { p_provider: "payhere", p_sub_ref: n.subscriptionId, p_status: "past_due", p_cancel_at_period_end: null, p_period_end: null });
      outcome = "past due";
    }
  } else if (n.statusCode === -1 || n.statusCode === -2) {
    await db.rpc("billing_order_failed", { p_order: order.id, p_status: n.statusCode === -1 ? "cancelled" : "failed" });
    outcome = n.statusCode === -1 ? "cancelled" : "failed";
  }

  await recordEvent("payhere", eventId, type || `status ${n.statusCode}`, order.account_id, outcome);
  return done();
}
