"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { billingProfileSchema, fieldErrors } from "@/lib/validation/schemas";
import { PROVIDER_CURRENCY, formatMoney, type BillingInterval, type Catalog, type PackId, type PlanId, type Provider } from "@/lib/billing/catalog";
import { Badge, Field, LoadError, Notice, Segmented, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";

type Summary = {
  plan: string;
  credits: number;
  providers: { payhere: boolean; stripe: boolean };
  catalog: Catalog;
  suggestedProvider: Provider;
  subscription: {
    provider: Provider;
    plan: PlanId;
    interval: BillingInterval;
    amountMinor: number;
    currency: "LKR" | "USD";
    status: "active" | "past_due" | "cancelled";
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
  profile: Record<"firstName" | "lastName" | "email" | "phone" | "address" | "city" | "country" | "company" | "taxId", string> | null;
  hasStripeCustomer: boolean;
  payments: Array<{ id: string; receiptNo: string; description: string; amountMinor: number; currency: "LKR" | "USD"; status: string; paidAt: string; provider: string }>;
};

const PLAN_LABEL: Record<string, string> = { trial: "Free trial", free: "Free", starter: "Starter", growth: "Growth", scale: "Scale", paused: "Paused" };
const COUNTRIES = ["LK", "IN", "MV", "BD", "PK", "NP", "SG", "MY", "TH", "AE", "SA", "QA", "OM", "KW", "BH", "AU", "NZ", "GB", "IE", "DE", "FR", "NL", "IT", "ES", "SE", "NO", "DK", "CH", "US", "CA", "JP", "KR", "HK", "PH", "ID", "VN", "ZA", "KE", "NG"];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function BillingView() {
  const search = useSearchParams();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Summary>("/api/billing").then((r) => (r.ok ? setData(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full rounded-[var(--radius-panel)]" />;

  const anyProvider = data.providers.payhere || data.providers.stripe;
  return (
    <div className="space-y-6">
      {search.get("cancelled") === "1" && <Notice kind="info">Payment cancelled. Nothing was charged.</Notice>}
      <CurrentPlan data={data} onChanged={load} />
      {!anyProvider && (
        <Notice kind="info">
          Payments aren&rsquo;t switched on yet. Add your PayHere and/or Stripe keys to <code>.env.local</code> (see <code>.env.example</code>) and restart.
        </Notice>
      )}
      <BillingDetails profile={data.profile} onSaved={load} />
      {anyProvider && <Buy data={data} />}
      <History payments={data.payments} />
    </div>
  );
}

function CurrentPlan({ data, onChanged }: { data: Summary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const s = data.subscription;

  async function cancel() {
    if (!s) return;
    const ok = await confirmDialog({
      title: "Cancel your plan?",
      body: `You won't be charged again. ${data.catalog.plans.find((x) => x.id === s.plan)?.name ?? "Your plan"} stays active${s.currentPeriodEnd ? ` until ${fmtDate(s.currentPeriodEnd)}` : " until the end of the period you've paid for"}, then you move to the free plan. Responses you have left are kept.`,
      confirmLabel: "Cancel plan",
      cancelLabel: "Keep plan",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await api("/api/billing/cancel", { method: "POST" });
    setBusy(false);
    if (r.ok) {
      setMsg({ kind: "success", text: "Your plan is cancelled. You won't be charged again." });
      onChanged();
    } else setMsg({ kind: "error", text: r.message });
  }

  async function portal() {
    setBusy(true);
    const r = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
    setBusy(false);
    if (r.ok && r.data.url.startsWith("https://billing.stripe.com/")) window.location.assign(r.data.url);
    else if (!r.ok) setMsg({ kind: "error", text: r.message });
  }

  return (
    <SettingsSection title="Your plan">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[28px] font-bold leading-tight">{PLAN_LABEL[data.plan] ?? data.plan}</p>
          <p className="mt-1 text-sm">
            <Badge tone={data.credits > 20 ? "brand" : "neg"}>{data.credits.toLocaleString()} responses left</Badge>
          </p>
          {s && (
            <p className="mt-2 text-sm text-muted">
              {formatMoney(s.amountMinor, s.currency)} / {s.interval === "year" ? "year" : "month"} via {s.provider === "payhere" ? "PayHere" : "Stripe"}
              {s.status === "past_due" && <span className="font-semibold text-neg-text">, last payment failed: the provider will retry</span>}
              {s.currentPeriodEnd && (s.cancelAtPeriodEnd || s.status === "cancelled" ? `, ends ${fmtDate(s.currentPeriodEnd)}` : `, renews ${fmtDate(s.currentPeriodEnd)}`)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {s?.provider === "stripe" && data.hasStripeCustomer && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={portal}>
              Update card
            </button>
          )}
          {s && s.status !== "cancelled" && !s.cancelAtPeriodEnd && (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={cancel}>
              Cancel plan
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-[13px] text-muted">Each paid month adds the plan&rsquo;s responses to your balance. Unused responses roll over and never expire.</p>
      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}
    </SettingsSection>
  );
}

function BillingDetails({ profile, onSaved }: { profile: Summary["profile"]; onSaved: () => void }) {
  const [editing, setEditing] = useState(!profile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const regionName = (code: string) => {
    try {
      return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const parsed = billingProfileSchema.safeParse({
      firstName: get("bFirst"),
      lastName: get("bLast"),
      email: get("bEmail"),
      phone: get("bPhone"),
      address: get("bAddress"),
      city: get("bCity"),
      country: get("bCountry"),
      company: get("bCompany"),
      taxId: get("bTax"),
    });
    const map = (errs: Record<string, string>) => ({
      bFirst: errs.firstName ?? "",
      bLast: errs.lastName ?? "",
      bEmail: errs.email ?? "",
      bPhone: errs.phone ?? "",
      bAddress: errs.address ?? "",
      bCity: errs.city ?? "",
      bCountry: errs.country ?? "",
      bCompany: errs.company ?? "",
      bTax: errs.taxId ?? "",
    });
    if (!parsed.success) return setErrors(map(fieldErrors(parsed.error)));
    setErrors({});
    setBusy(true);
    const r = await api("/api/billing/profile", { method: "PUT", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: "success", text: "Billing details saved." });
      setEditing(false);
      onSaved();
    } else {
      setErrors(map(r.fields ?? {}));
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }

  if (!editing && profile) {
    return (
      <SettingsSection title="Billing details" description="Shown on your receipts and sent to the payment provider.">
        {notice && (
          <div className="mb-3">
            <Notice kind={notice.kind}>{notice.text}</Notice>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
          <address className="not-italic">
            <span className="font-semibold">
              {profile.firstName} {profile.lastName}
            </span>
            {profile.company && <>, {profile.company}</>}
            <br />
            {profile.address}, {profile.city}, {regionName(profile.country)}
            <br />
            {profile.email} · {profile.phone}
            {profile.taxId && (
              <>
                <br />
                Tax / VAT: {profile.taxId}
              </>
            )}
          </address>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </SettingsSection>
    );
  }

  const p = profile;
  return (
    <SettingsSection title="Billing details" description="Needed before you pay. Shown on your receipts and sent to the payment provider.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="bFirst" error={errors.bFirst || undefined}>
            <TextInput name="bFirst" defaultValue={p?.firstName} autoComplete="given-name" maxLength={60} error={errors.bFirst || undefined} />
          </Field>
          <Field label="Last name" name="bLast" error={errors.bLast || undefined}>
            <TextInput name="bLast" defaultValue={p?.lastName} autoComplete="family-name" maxLength={60} error={errors.bLast || undefined} />
          </Field>
          <Field label="Billing email" name="bEmail" error={errors.bEmail || undefined}>
            <TextInput name="bEmail" type="email" defaultValue={p?.email} autoComplete="email" maxLength={254} error={errors.bEmail || undefined} />
          </Field>
          <Field label="Phone" name="bPhone" error={errors.bPhone || undefined}>
            <TextInput name="bPhone" type="tel" defaultValue={p?.phone} autoComplete="tel" placeholder="+94 77 123 4567" maxLength={20} error={errors.bPhone || undefined} />
          </Field>
          <Field label="Address" name="bAddress" error={errors.bAddress || undefined}>
            <TextInput name="bAddress" defaultValue={p?.address} autoComplete="street-address" maxLength={200} error={errors.bAddress || undefined} />
          </Field>
          <Field label="City" name="bCity" error={errors.bCity || undefined}>
            <TextInput name="bCity" defaultValue={p?.city} autoComplete="address-level2" maxLength={80} error={errors.bCity || undefined} />
          </Field>
          <div className="space-y-1.5">
            <label htmlFor="bCountry" className="block text-sm font-semibold">
              Country
            </label>
            <select id="bCountry" name="bCountry" className="input" defaultValue={p?.country ?? "LK"} autoComplete="country">
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {regionName(c)}
                </option>
              ))}
            </select>
            {errors.bCountry && <p className="text-[13px] font-medium text-neg-text">{errors.bCountry}</p>}
          </div>
          <Field label="Company" name="bCompany" optional error={errors.bCompany || undefined}>
            <TextInput name="bCompany" defaultValue={p?.company} autoComplete="organization" maxLength={120} error={errors.bCompany || undefined} />
          </Field>
          <Field label="Tax / VAT number" name="bTax" optional error={errors.bTax || undefined}>
            <TextInput name="bTax" defaultValue={p?.taxId} maxLength={40} error={errors.bTax || undefined} />
          </Field>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save details"}
          </button>
          {profile && (
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </SettingsSection>
  );
}

function Buy({ data }: { data: Summary }) {
  const providers = (["payhere", "stripe"] as const).filter((p) => data.providers[p]);
  // One currency, chosen from where the business is: Sri Lanka pays in rupees (PayHere), everyone else in
  // dollars (Stripe). Sri Lankans with a foreign card can still switch to dollars.
  const [provider, setProvider] = useState<Provider>(providers.includes(data.suggestedProvider) ? data.suggestedProvider : (providers[0] ?? "payhere"));
  const canSwitchToUsd = data.suggestedProvider === "payhere" && providers.includes("stripe");
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const currency = PROVIDER_CURRENCY[provider];
  const s = data.subscription;
  const hasLivePlan = Boolean(s && s.status !== "cancelled");
  const [codeInput, setCodeInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; summary: string; prices: Record<string, { amountMinor: number; listAmountMinor: number; bonusCredits: number }> } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  // Prices change with currency and period, so a code is re-checked whenever those change.
  async function applyCode(code: string, prov = provider, per = interval) {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,30}$/.test(c)) return setPromoError("That code isn't valid.");
    setPromoError("");
    setPromoBusy(true);
    const r = await api<{ code: string; summary: string; prices: Record<string, { amountMinor: number; listAmountMinor: number; bonusCredits: number }> }>("/api/billing/promo", {
      method: "POST",
      body: { code: c, provider: prov, interval: per },
    });
    setPromoBusy(false);
    if (r.ok) setPromo(r.data);
    else {
      setPromo(null);
      setPromoError(r.message);
    }
  }
  const changeProvider = (p: Provider) => {
    setProvider(p);
    if (promo) applyCode(promo.code, p, interval);
  };
  const changeInterval = (i: BillingInterval) => {
    setBillingInterval(i);
    if (promo) applyCode(promo.code, provider, i);
  };
  const priceFor = (item: string, list: number) => {
    const p = promo?.prices[item];
    return p ? { amount: p.amountMinor, list: p.listAmountMinor, bonus: p.bonusCredits, applied: true } : { amount: list, list, bonus: 0, applied: false };
  };
  const Price = ({ item, list, per }: { item: string; list: number; per?: string }) => {
    const x = priceFor(item, list);
    return (
      <>
        {x.applied && x.amount !== x.list && <s className="mr-1.5 text-base font-normal text-muted">{formatMoney(x.list, currency)}</s>}
        {formatMoney(x.amount, currency)}
        {per && <span className="text-sm font-normal text-muted"> / {per}</span>}
        {x.bonus > 0 && <span className="ml-1.5 align-middle text-[13px] font-semibold text-pos-text">+{x.bonus.toLocaleString()} bonus</span>}
      </>
    );
  };

  async function checkout(item: PlanId | PackId) {
    if (!data.profile) return setError("Add your billing details first.");
    setError("");
    setBusy(item);
    const r = await api<{ type: "payhere"; url: string; fields: Record<string, string> } | { type: "redirect"; url: string }>("/api/billing/checkout", {
      method: "POST",
      body: { item, provider, ...(item.startsWith("pack_") ? {} : { interval }), ...(promo?.prices[item] ? { promoCode: promo.code } : {}) },
    });
    if (!r.ok) {
      setBusy(null);
      return setError(r.message);
    }
    if (r.data.type === "redirect") {
      if (!r.data.url.startsWith("https://checkout.stripe.com/")) return setError("Unexpected payment address.");
      window.location.assign(r.data.url);
      return;
    }
    // PayHere: post the signed fields to PayHere's checkout page.
    if (!/^https:\/\/(www|sandbox)\.payhere\.lk\/pay\/checkout$/.test(r.data.url)) return setError("Unexpected payment address.");
    const form = document.createElement("form");
    form.method = "POST";
    form.action = r.data.url;
    for (const [k, v] of Object.entries(r.data.fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <>
      <SettingsSection title="Plans" description="Cancel any time. Yearly plans cost the same as 10 months.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented
            label="Billing period"
            value={interval}
            onChange={changeInterval}
            options={[
              { value: "month", label: "Monthly" },
              { value: "year", label: "Yearly" },
            ]}
          />
        </div>
        <p className="mb-4 text-[13px] text-muted">
          {provider === "payhere" ? "Prices in Sri Lankan rupees, paid with PayHere." : "Prices in US dollars, paid by card with Stripe."}
          {canSwitchToUsd && (
            <>
              {" "}
              <button type="button" className="font-semibold text-brand underline underline-offset-2" onClick={() => changeProvider(provider === "payhere" ? "stripe" : "payhere")}>
                {provider === "payhere" ? "Paying with a foreign card? Pay in US dollars" : "Pay in rupees instead"}
              </button>
            </>
          )}
        </p>
        <form
          className="mb-4 flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyCode(codeInput);
          }}
        >
          <label htmlFor="promoCode" className="sr-only">
            Promo code
          </label>
          <input
            id="promoCode"
            className="input w-48"
            placeholder="Promo code"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={30}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            aria-invalid={promoError ? "true" : undefined}
            aria-describedby={promoError ? "promo-error" : undefined}
          />
          <button className="btn btn-secondary" disabled={promoBusy || !codeInput.trim()}>
            {promoBusy ? "Checking…" : "Apply"}
          </button>
          {promo && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPromo(null);
                setCodeInput("");
              }}
            >
              Remove code
            </button>
          )}
          {promoError && (
            <p id="promo-error" className="w-full text-[13px] font-medium text-neg-text">
              {promoError}
            </p>
          )}
          {promo && (
            <p className="w-full text-[13px] font-semibold text-pos-text" role="status">
              {promo.code} applied: {promo.summary}. Prices below include it.
            </p>
          )}
        </form>
        {error && (
          <div className="mb-4">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        {hasLivePlan && (
          <div className="mb-4">
            <Notice kind="info">To change plan, cancel your current one; you can choose a new plan when it ends. Top-ups are always available.</Notice>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {data.catalog.plans.filter((p) => p.active).map((p) => {
            const current = s?.plan === p.id && hasLivePlan;
            return (
              <div key={p.id} className={`flex flex-col rounded-[12px] border p-4 ${p.id === "growth" ? "border-brand" : "border-line"}`}>
                <p className="flex items-center justify-between font-semibold">
                  {p.name}
                  {p.id === "growth" && <Badge tone="brand">Popular</Badge>}
                </p>
                <p className="mt-2 text-2xl font-bold">
                  <Price item={p.id} list={p.price[currency][interval]} per={interval === "year" ? "year" : "month"} />
                </p>
                <p className="mt-1 text-sm">{p.monthlyResponses.toLocaleString()} responses a month</p>
                <p className="mt-1 flex-1 text-[13px] text-muted">{p.blurb}</p>
                <button
                  type="button"
                  className={`btn mt-4 ${p.id === "growth" ? "btn-primary" : "btn-secondary"}`}
                  disabled={busy !== null || hasLivePlan || !data.profile}
                  onClick={() => checkout(p.id)}
                >
                  {current ? "Current plan" : busy === p.id ? "Opening…" : `Choose ${p.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="Top up responses" description="One-off packs. They never expire and work on any plan.">
        <div className="grid gap-3 sm:grid-cols-3">
          {data.catalog.packs.filter((k) => k.active).map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-line p-4">
              <div>
                <p className="font-semibold">{k.responses.toLocaleString()} responses</p>
                <p className="text-sm text-muted">
                  <Price item={k.id} list={k.price[currency]} />
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null || !data.profile} onClick={() => checkout(k.id)}>
                {busy === k.id ? "Opening…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
        {!data.profile && <p className="mt-3 text-[13px] text-muted">Add your billing details above to buy.</p>}
      </SettingsSection>
    </>
  );
}

function History({ payments }: { payments: Summary["payments"] }) {
  return (
    <SettingsSection title="Payments and receipts">
      {payments.length === 0 ? (
        <p className="text-sm text-muted">No payments yet.</p>
      ) : (
        <>
        {/* Phones: one card per payment. */}
        <ul className="divide-y divide-line sm:hidden">
          {payments.map((p) => (
            <li key={p.id} className="py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{formatMoney(p.amountMinor, p.currency)}</span>
                <span className="text-muted">{fmtDate(p.paidAt)}</span>
              </div>
              <p className="mt-0.5">
                {p.description}
                {p.status === "refunded" && (
                  <>
                    {" "}
                    <Badge tone="plain">Refunded</Badge>
                  </>
                )}
              </p>
              <Link className="link mt-1 inline-flex min-h-9 items-center" href={`/app/settings/billing/receipts/${p.id}`}>
                Receipt {p.receiptNo}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[13px] text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Amount</th>
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                  <td className="py-2 pr-3">
                    {p.description}
                    {p.status === "refunded" && (
                      <>
                        {" "}
                        <Badge tone="plain">Refunded</Badge>
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatMoney(p.amountMinor, p.currency)}</td>
                  <td className="py-2 text-right">
                    <Link className="link" href={`/app/settings/billing/receipts/${p.id}`}>
                      {p.receiptNo}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </SettingsSection>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingView />
    </Suspense>
  );
}
