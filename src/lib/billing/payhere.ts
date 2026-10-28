// PayHere (Sri Lanka). Pure parts are unit-tested; network calls are at the bottom.
// Docs: https://support.payhere.lk/api-&-mobile-sdk/checkout-api and .../recurring-api
//   checkout hash = UPPER(md5(merchant_id + order_id + amount + currency + UPPER(md5(secret))))
//   notify md5sig = UPPER(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(md5(secret))))
import { createHash, timingSafeEqual } from "node:crypto";

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex").toUpperCase();

export function payhereHash(merchantId: string, orderId: string, amount: string, currency: string, merchantSecret: string): string {
  return md5(merchantId + orderId + amount + currency + md5(merchantSecret));
}

export function payhereCheckoutUrl(sandbox: boolean): string {
  return sandbox ? "https://sandbox.payhere.lk/pay/checkout" : "https://www.payhere.lk/pay/checkout";
}

export type PayhereCustomer = { firstName: string; lastName: string; email: string; phone: string; address: string; city: string; country: string };

/** Fields for the browser to POST to PayHere. The secret never leaves the server; only the hash does. */
export function buildPayhereCheckout(args: {
  sandbox: boolean;
  merchantId: string;
  merchantSecret: string;
  orderId: string;
  amount: string; // "1490.00"
  currency: "LKR" | "USD";
  items: string;
  customer: PayhereCustomer;
  appOrigin: string;
  recurrence?: "1 Month" | "1 Year";
}): { url: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {
    merchant_id: args.merchantId,
    return_url: `${args.appOrigin}/app/settings/billing/return?order=${args.orderId}`,
    cancel_url: `${args.appOrigin}/app/settings/billing?cancelled=1`,
    notify_url: `${args.appOrigin}/api/webhooks/payhere`,
    order_id: args.orderId,
    items: args.items.slice(0, 100),
    currency: args.currency,
    amount: args.amount,
    first_name: args.customer.firstName,
    last_name: args.customer.lastName,
    email: args.customer.email,
    phone: args.customer.phone,
    address: args.customer.address,
    city: args.customer.city,
    country: args.customer.country === "LK" ? "Sri Lanka" : args.customer.country,
    hash: payhereHash(args.merchantId, args.orderId, args.amount, args.currency, args.merchantSecret),
  };
  if (args.recurrence) {
    fields.recurrence = args.recurrence;
    fields.duration = "Forever";
  }
  return { url: payhereCheckoutUrl(args.sandbox), fields };
}

export type PayhereNotify = {
  orderId: string;
  paymentId: string | null;
  amountMinor: number;
  currency: string;
  statusCode: number;
  messageType: string | null;
  subscriptionId: string | null;
  recStatus: number | null;
  nextDate: string | null;
};

const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Checks a notification from PayHere: our merchant id, a valid signature (constant-time compare),
 * well-formed values. Returns null if anything is off.
 */
export function verifyPayhereNotify(form: URLSearchParams, merchantId: string, merchantSecret: string): PayhereNotify | null {
  const one = (k: string) => {
    const all = form.getAll(k);
    return all.length === 1 ? (all[0] ?? "") : null;
  };
  const mid = one("merchant_id");
  const orderId = one("order_id");
  const amount = one("payhere_amount");
  const currency = one("payhere_currency");
  const status = one("status_code");
  const sig = one("md5sig");
  if (mid !== merchantId || !orderId || !amount || !currency || status === null || !sig) return null;
  if (!/^[0-9a-f-]{36}$/.test(orderId) || !AMOUNT_RE.test(amount) || !/^[A-Z]{3}$/.test(currency) || !/^-?\d$/.test(status)) return null;
  const expected = Buffer.from(md5(mid + orderId + amount + currency + status + md5(merchantSecret)), "utf8");
  const got = Buffer.from(sig.toUpperCase(), "utf8");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;

  const paymentId = one("payment_id");
  const sub = one("subscription_id");
  const rec = one("item_rec_status");
  const next = one("item_rec_date_next");
  return {
    orderId,
    paymentId: paymentId && /^[0-9A-Za-z_-]{1,64}$/.test(paymentId) ? paymentId : null,
    amountMinor: Math.round(Number(amount) * 100),
    currency,
    statusCode: Number(status),
    messageType: one("message_type"),
    subscriptionId: sub && /^[0-9A-Za-z_-]{1,64}$/.test(sub) ? sub : null,
    recStatus: rec && /^-?\d$/.test(rec) ? Number(rec) : null,
    nextDate: next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null,
  };
}

// ---------------------------------------------------------------------------
// Subscription Manager API (cancelling a recurring payment). Live use needs the server's IP
// whitelisted by PayHere support.
// ---------------------------------------------------------------------------

export async function payhereCancelSubscription(args: { sandbox: boolean; appId: string; appSecret: string; subscriptionId: string }): Promise<boolean> {
  if (!/^\d{1,30}$/.test(args.subscriptionId)) return false;
  const base = args.sandbox ? "https://sandbox.payhere.lk" : "https://www.payhere.lk";
  try {
    const tokenRes = await fetch(`${base}/merchant/v1/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${args.appId}:${args.appSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const token = ((await tokenRes.json().catch(() => null)) as { access_token?: string } | null)?.access_token;
    if (!tokenRes.ok || !token) return false;
    const res = await fetch(`${base}/merchant/v1/subscription/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_id: Number(args.subscriptionId) }),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { status?: number } | null;
    return res.ok && json?.status === 1;
  } catch {
    return false;
  }
}
