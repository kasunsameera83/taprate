import { rewardReferral } from "@/lib/referrals/server";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { invoiceSubscription, periodEnd, stripeApi, verifyStripeSignature } from "@/lib/billing/stripe";
import { eventSeen, orderById, recordEvent } from "@/lib/billing/server";
import { audit } from "@/lib/audit";

// Stripe webhooks (server-to-server). Proven by the Stripe-Signature header (HMAC of the raw body with
// our endpoint secret, 5-minute replay window). Then: the order named in the metadata must exist, be a
// Stripe order of the same account, and the amount/currency must match it (checked again in the
// database). Each Stripe event and each payment is applied once.
export const dynamic = "force-dynamic";
const MAX_BYTES = 512 * 1024;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = (prefix: string) => new RegExp(`^${prefix}_[A-Za-z0-9]{1,100}$`);

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const idOf = (v: unknown) => (typeof v === "string" ? v : typeof (v as Obj | null)?.id === "string" ? ((v as Obj).id as string) : null);

class Retry extends Error {}

export async function POST(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.webhookPerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return json({ ok: false }, 429);
  if (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET) return json({ ok: false, error: "not configured" }, 503);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return json({ ok: false }, 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return json({ ok: false }, 413);
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), e.STRIPE_WEBHOOK_SECRET)) {
    console.warn("[stripe] rejected webhook (bad signature)");
    return json({ ok: false }, 400);
  }

  let event: { id?: string; type?: string; data?: { object?: Obj } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }
  const eventId = str(event.id);
  const type = str(event.type) ?? "";
  const obj = event.data?.object;
  if (!eventId || !ID("evt").test(eventId) || !obj) return json({ ok: false }, 400);
  if (await eventSeen("stripe", eventId)) return json({ ok: true, duplicate: true });

  try {
    const { outcome, accountId } = await handle(type, obj, e.STRIPE_SECRET_KEY);
    await recordEvent("stripe", eventId, type, accountId, outcome);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof Retry) return json({ ok: false }, 500); // Stripe retries later
    console.error("[stripe] webhook handler failed", { type });
    return json({ ok: false }, 500);
  }
}

async function grant(orderId: string | null, accountHint: string | null, paymentId: string, amount: unknown, currency: unknown, subRef: string | null, end: string | null) {
  if (!orderId || !UUID.test(orderId)) return { outcome: "no order", accountId: null };
  const order = await orderById(orderId);
  if (!order || order.provider !== "stripe" || (accountHint && accountHint !== order.account_id)) return { outcome: "unknown order", accountId: null };
  if (typeof amount !== "number" || typeof currency !== "string") return { outcome: "rejected: bad amount", accountId: order.account_id };
  const { data, error } = await adminClient().rpc("billing_record_payment", {
    p_order: order.id,
    p_provider: "stripe",
    p_payment_id: paymentId,
    p_amount_minor: amount,
    p_currency: currency.toUpperCase(),
    p_sub_ref: order.kind === "plan" ? subRef : null,
    p_period_end: end,
  });
  if (error) {
    if (/mismatch|unknown order|required/.test(error.message ?? "")) return { outcome: `rejected: ${error.message}`.slice(0, 80), accountId: order.account_id };
    throw new Retry();
  }
  if (data === "granted") {
    await audit({ accountId: order.account_id, userId: null, action: "billing.paid", targetType: "order", targetId: order.id, metadata: { provider: "stripe" } });
    await rewardReferral(order.account_id);
  }
  return { outcome: String(data), accountId: order.account_id };
}

async function saveCustomer(orderId: string | null, customer: string | null) {
  if (!orderId || !UUID.test(orderId) || !customer || !ID("cus").test(customer)) return;
  const order = await orderById(orderId);
  if (!order) return;
  await adminClient().from("billing_profiles").update({ stripe_customer_id: customer }).eq("account_id", order.account_id);
}

const SUB_STATUS: Record<string, "active" | "past_due" | "ended"> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  incomplete: "past_due",
  canceled: "ended",
  incomplete_expired: "ended",
};

async function handle(type: string, obj: Obj, key: string): Promise<{ outcome: string; accountId: string | null }> {
  const db = adminClient();
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      const orderId = str(obj.client_reference_id) ?? meta.order_id ?? null;
      await saveCustomer(orderId, idOf(obj.customer));
      // Subscriptions are granted by invoice.paid (first and every renewal); one-off packs here.
      if (obj.mode !== "payment") return { outcome: "subscription checkout", accountId: null };
      if (obj.payment_status !== "paid") return { outcome: "awaiting payment", accountId: null };
      const pi = idOf(obj.payment_intent);
      if (!pi || !ID("pi").test(pi)) return { outcome: "no payment intent", accountId: null };
      return grant(orderId, meta.account_id ?? null, pi, obj.amount_total, obj.currency, null, null);
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const orderId = str(obj.client_reference_id);
      if (orderId && UUID.test(orderId)) await db.rpc("billing_order_failed", { p_order: orderId, p_status: type.endsWith("expired") ? "cancelled" : "failed" });
      return { outcome: "order closed", accountId: null };
    }
    case "invoice.paid": {
      const invId = str(obj.id);
      if (!invId || !ID("in").test(invId)) return { outcome: "bad invoice", accountId: null };
      let { subscriptionId, metadata } = invoiceSubscription(obj as never);
      if (!subscriptionId || !ID("sub").test(subscriptionId)) return { outcome: "not a subscription invoice", accountId: null };
      if (!metadata.order_id) {
        const s = await stripeApi<{ metadata?: Record<string, string> }>(key, "GET", `/v1/subscriptions/${subscriptionId}`);
        if (!s.ok) throw new Retry();
        metadata = s.data.metadata ?? {};
      }
      const line = ((obj.lines as Obj | undefined)?.data as Array<{ period?: { end?: number } }> | undefined)?.[0];
      const end = typeof line?.period?.end === "number" ? new Date(line.period.end * 1000).toISOString() : null;
      return grant(metadata.order_id ?? null, metadata.account_id ?? null, invId, obj.amount_paid, obj.currency, subscriptionId, end);
    }
    case "invoice.payment_failed": {
      const { subscriptionId } = invoiceSubscription(obj as never);
      if (subscriptionId) await db.rpc("billing_subscription_update", { p_provider: "stripe", p_sub_ref: subscriptionId, p_status: "past_due", p_cancel_at_period_end: null, p_period_end: null });
      return { outcome: "past due", accountId: null };
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subId = str(obj.id);
      if (!subId || !ID("sub").test(subId)) return { outcome: "bad subscription", accountId: null };
      const status = type.endsWith("deleted") ? "ended" : (SUB_STATUS[str(obj.status) ?? ""] ?? "active");
      const { data } = await db.rpc("billing_subscription_update", {
        p_provider: "stripe",
        p_sub_ref: subId,
        p_status: status,
        p_cancel_at_period_end: typeof obj.cancel_at_period_end === "boolean" ? obj.cancel_at_period_end : null,
        p_period_end: periodEnd(obj as never),
      });
      return { outcome: `subscription ${status}: ${String(data)}`, accountId: null };
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      // Only full refunds/disputes take credits back. Packs are recorded by payment intent, plans by invoice.
      const charge = type === "charge.refunded" ? obj : null;
      if (charge && charge.refunded !== true) return { outcome: "partial refund (no change)", accountId: null };
      const refs = [idOf(obj.payment_intent), idOf(obj.invoice)].filter((x): x is string => Boolean(x));
      for (const ref of refs) {
        const { data } = await db.rpc("billing_reverse_payment", { p_provider: "stripe", p_payment_id: ref });
        if (data === "reversed" || data === "duplicate") return { outcome: `reversed (${String(data)})`, accountId: null };
      }
      return { outcome: "refund for unknown payment", accountId: null };
    }
    default:
      return { outcome: "ignored", accountId: null };
  }
}
