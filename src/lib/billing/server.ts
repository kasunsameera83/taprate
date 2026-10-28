import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { majorAmount, type Provider, type Quote } from "@/lib/billing/catalog";
import { buildPayhereCheckout } from "@/lib/billing/payhere";
import { stripeApi } from "@/lib/billing/stripe";
import type { Promo } from "@/lib/billing/promo";

// Billing helpers that touch the database or the providers. The service-role client is used only after
// the caller's own permission checks, and every query is scoped to that account.

export type ProfileRow = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  company: string | null;
  tax_id: string | null;
  stripe_customer_id: string | null;
};

export async function loadProfile(accountId: string): Promise<ProfileRow | null> {
  const { data } = await adminClient()
    .from("billing_profiles")
    .select("first_name, last_name, email, phone, address, city, country, company, tax_id, stripe_customer_id")
    .eq("account_id", accountId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export async function liveSubscription(accountId: string) {
  const { data } = await adminClient()
    .from("subscriptions")
    .select("id, provider, provider_sub_id, plan, billing_interval, amount_minor, currency, status, cancel_at_period_end, current_period_end, created_at")
    .eq("account_id", accountId)
    .in("status", ["active", "past_due", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function createOrder(
  accountId: string,
  userId: string,
  provider: Provider,
  q: Quote,
  promo?: { promoId: string; listAmountMinor: number; bonusCredits: number },
): Promise<string> {
  const { data, error } = await adminClient()
    .from("billing_orders")
    .insert({
      account_id: accountId,
      created_by: userId,
      provider,
      kind: q.kind,
      item: q.item,
      billing_interval: q.interval,
      credits: q.credits,
      amount_minor: q.amountMinor,
      currency: q.currency,
      promo_id: promo?.promoId ?? null,
      list_amount_minor: promo?.listAmountMinor ?? null,
      bonus_credits: promo?.bonusCredits ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("could not create order");
  return data.id as string;
}

export type CheckoutStart = { type: "payhere"; url: string; fields: Record<string, string> } | { type: "redirect"; url: string };

export async function startPayhere(orderId: string, q: Quote, profile: ProfileRow): Promise<CheckoutStart> {
  const e = env();
  const { url, fields } = buildPayhereCheckout({
    sandbox: e.PAYHERE_SANDBOX !== "false",
    merchantId: e.PAYHERE_MERCHANT_ID!,
    merchantSecret: e.PAYHERE_MERCHANT_SECRET!,
    orderId,
    amount: majorAmount(q.amountMinor),
    currency: "LKR",
    items: q.description,
    customer: {
      firstName: profile.first_name,
      lastName: profile.last_name,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
      city: profile.city,
      country: profile.country,
    },
    appOrigin: e.appOrigin,
    recurrence: q.kind === "plan" ? (q.interval === "year" ? "1 Year" : "1 Month") : undefined,
  });
  return { type: "payhere", url, fields };
}

export async function startStripe(orderId: string, accountId: string, q: Quote, profile: ProfileRow): Promise<CheckoutStart | null> {
  const e = env();
  const metadata = { order_id: orderId, account_id: accountId };
  const isPlan = q.kind === "plan";
  const res = await stripeApi<{ id: string; url: string }>(
    e.STRIPE_SECRET_KEY!,
    "POST",
    "/v1/checkout/sessions",
    {
      mode: isPlan ? "subscription" : "payment",
      client_reference_id: orderId,
      metadata,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: q.amountMinor,
            product_data: { name: q.description },
            ...(isPlan ? { recurring: { interval: q.interval! } } : {}),
          },
        },
      ],
      ...(isPlan ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
      ...(profile.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: profile.email, ...(isPlan ? {} : { customer_creation: "always" }) }),
      success_url: `${e.appOrigin}/app/settings/billing/return?order=${orderId}`,
      cancel_url: `${e.appOrigin}/app/settings/billing?cancelled=1`,
    },
    `checkout-${orderId}`,
  );
  if (!res.ok || !res.data.url.startsWith("https://checkout.stripe.com/")) {
    console.error("[billing] stripe checkout failed", { status: res.ok ? 200 : res.status });
    return null;
  }
  await adminClient().from("billing_orders").update({ provider_ref: res.data.id }).eq("id", orderId).eq("account_id", accountId);
  return { type: "redirect", url: res.data.url };
}

/** Records a processed provider notification (after it was handled), for support and replay protection. */
export async function recordEvent(provider: Provider, eventId: string, eventType: string, accountId: string | null, outcome: string): Promise<void> {
  await adminClient()
    .from("billing_events")
    .upsert({ provider, event_id: eventId.slice(0, 200), event_type: eventType.slice(0, 80), account_id: accountId, outcome: outcome.slice(0, 80) }, { onConflict: "provider,event_id", ignoreDuplicates: true });
}

export async function eventSeen(provider: Provider, eventId: string): Promise<boolean> {
  const { data } = await adminClient().from("billing_events").select("id").eq("provider", provider).eq("event_id", eventId.slice(0, 200)).maybeSingle();
  return Boolean(data);
}

export async function orderById(orderId: string) {
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return null;
  const { data } = await adminClient().from("billing_orders").select("id, account_id, provider, kind, item, amount_minor, currency, status").eq("id", orderId).maybeSingle();
  return data;
}

type PromoRow = {
  id: string;
  code: string;
  description: string;
  kind: "percent" | "amount" | "credits";
  percent_off: number | null;
  amount_off_lkr: number | null;
  amount_off_usd: number | null;
  bonus_credits: number | null;
  applies_to: string[];
  max_uses: number | null;
  starts_at: string;
  ends_at: string | null;
  enabled: boolean;
};

/** A code plus how often it's been used (in total, and by this business). Service role, exact-match lookup. */
export async function loadPromo(code: string, accountId: string): Promise<{ promo: Promo | null; usage: { total: number; usedByThisBusiness: boolean } }> {
  const db = adminClient();
  const { data } = await db
    .from("promo_codes")
    .select("id, code, description, kind, percent_off, amount_off_lkr, amount_off_usd, bonus_credits, applies_to, max_uses, starts_at, ends_at, enabled")
    .eq("code", code)
    .maybeSingle();
  const r = data as PromoRow | null;
  if (!r) return { promo: null, usage: { total: 0, usedByThisBusiness: false } };
  const [{ count: total }, { count: mine }] = await Promise.all([
    db.from("promo_redemptions").select("id", { count: "exact", head: true }).eq("promo_id", r.id),
    db.from("promo_redemptions").select("id", { count: "exact", head: true }).eq("promo_id", r.id).eq("account_id", accountId),
  ]);
  return {
    promo: {
      id: r.id,
      code: r.code,
      description: r.description,
      kind: r.kind,
      percentOff: r.percent_off,
      amountOffLkr: r.amount_off_lkr === null ? null : Number(r.amount_off_lkr),
      amountOffUsd: r.amount_off_usd === null ? null : Number(r.amount_off_usd),
      bonusCredits: r.bonus_credits,
      appliesTo: r.applies_to ?? [],
      maxUses: r.max_uses,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      enabled: r.enabled,
    },
    usage: { total: total ?? 0, usedByThisBusiness: (mine ?? 0) > 0 },
  };
}
