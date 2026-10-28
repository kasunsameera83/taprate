import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { billingProviders } from "@/lib/env";
import { loadCatalog } from "@/lib/billing/catalogServer";

// Billing overview for the owner: plan, credits, subscription, billing details, payments.
// Read through the user's own session, so the database's owner-only rules apply as well.
export const GET = secureRoute(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const acc = membership.accountId;
    const [account, sub, profile, payments, catalog] = await Promise.all([
      supabase.from("accounts").select("plan, credit_balance").eq("id", acc).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("id, provider, plan, billing_interval, amount_minor, currency, status, cancel_at_period_end, current_period_end")
        .eq("account_id", acc)
        .in("status", ["active", "past_due", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("billing_profiles").select("first_name, last_name, email, phone, address, city, country, company, tax_id, stripe_customer_id").eq("account_id", acc).maybeSingle(),
      supabase.from("billing_payments").select("id, receipt_no, description, amount_minor, currency, status, paid_at, provider").eq("account_id", acc).order("paid_at", { ascending: false }).limit(24),
      loadCatalog(),
    ]);
    for (const r of [account, sub, profile, payments]) if (r.error) throw dbError(r.error);
    const p = profile.data;
    const s = sub.data;
    return ok({
      plan: account.data?.plan ?? "trial",
      credits: account.data?.credit_balance ?? 0,
      providers: billingProviders(),
      catalog,
      subscription: s
        ? {
            provider: s.provider,
            plan: s.plan,
            interval: s.billing_interval,
            amountMinor: Number(s.amount_minor),
            currency: s.currency,
            status: s.status,
            cancelAtPeriodEnd: s.cancel_at_period_end,
            currentPeriodEnd: s.current_period_end,
          }
        : null,
      profile: p
        ? { firstName: p.first_name, lastName: p.last_name, email: p.email, phone: p.phone, address: p.address, city: p.city, country: p.country, company: p.company ?? "", taxId: p.tax_id ?? "" }
        : null,
      hasStripeCustomer: Boolean(p?.stripe_customer_id),
      payments: (payments.data ?? []).map((x) => ({
        id: x.id as string,
        receiptNo: x.receipt_no as string,
        description: x.description as string,
        amountMinor: Number(x.amount_minor),
        currency: x.currency as string,
        status: x.status as string,
        paidAt: x.paid_at as string,
        provider: x.provider as string,
      })),
    });
  },
);
