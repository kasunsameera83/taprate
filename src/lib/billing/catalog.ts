// What we sell. Prices are edited by the product owner in /admin/pricing and stored in the database
// (billing_catalog); DEFAULT_CATALOG is only the starting point and the fallback if that table is empty.
// The browser only ever sends a plan or pack id: the server prices it from the catalog.
// Amounts are in minor units (cents / cents of a rupee).

export type Currency = "LKR" | "USD";
export type Provider = "payhere" | "stripe";
export type PlanId = "starter" | "growth" | "scale";
export type PackId = "pack_250" | "pack_1000" | "pack_5000";
export type BillingInterval = "month" | "year";

export const PLAN_IDS: readonly PlanId[] = ["starter", "growth", "scale"];

/** Survey emails a business can send per day (UTC). Enforced in the database by
 *  private.daily_send_limit (migration 0029); keep the two in step. */
export const SEND_LIMITS = { trial: 100, free: 100, starter: 500, growth: 2000, scale: 5000, paused: 0 } as const;
export const PACK_IDS: readonly PackId[] = ["pack_250", "pack_1000", "pack_5000"];

/** PayHere is for Sri Lankan payments in rupees; Stripe for international cards in dollars. */
/** The currency each provider uses unless another is chosen. */
export const PROVIDER_CURRENCY: Record<Provider, Currency> = { payhere: "LKR", stripe: "USD" };
/** Currencies a provider can ever take. PayHere's USD also needs PAYHERE_USD_ENABLED (checked on the server). */
export const PROVIDER_CURRENCIES: Record<Provider, readonly Currency[]> = { payhere: ["LKR", "USD"], stripe: ["USD"] };

/** One way to pay: a provider and a currency. */
export type PayWay = { provider: Provider; currency: Currency };

/** The ways to pay that are switched on, in a stable order. */
export function payWays(p: { payhere: boolean; stripe: boolean; payhereUsd: boolean }): PayWay[] {
  const out: PayWay[] = [];
  if (p.payhere) out.push({ provider: "payhere", currency: "LKR" });
  if (p.stripe) out.push({ provider: "stripe", currency: "USD" });
  if (p.payhere && p.payhereUsd) out.push({ provider: "payhere", currency: "USD" });
  return out;
}

export const isPayWayOn = (ways: PayWay[], provider: Provider, currency: Currency) => ways.some((w) => w.provider === provider && w.currency === currency);

export type Plan = {
  id: PlanId;
  name: string;
  /** Responses added each month (a yearly plan adds 12x this up front). */
  monthlyResponses: number;
  blurb: string;
  price: Record<Currency, { month: number; year: number }>;
  active: boolean;
};

export type Pack = { id: PackId; name: string; responses: number; price: Record<Currency, number>; active: boolean };

export type Catalog = { plans: Plan[]; packs: Pack[] };

export const DEFAULT_CATALOG: Catalog = {
  plans: [
    { id: "starter", name: "Starter", monthlyResponses: 500, blurb: "For a small team getting started", price: { LKR: { month: 590000, year: 5900000 }, USD: { month: 1900, year: 19000 } }, active: true },
    { id: "growth", name: "Growth", monthlyResponses: 2000, blurb: "For busy support and sales teams", price: { LKR: { month: 1490000, year: 14900000 }, USD: { month: 4900, year: 49000 } }, active: true },
    { id: "scale", name: "Scale", monthlyResponses: 10000, blurb: "For high-volume and multi-team businesses", price: { LKR: { month: 3890000, year: 38900000 }, USD: { month: 12900, year: 129000 } }, active: true },
  ],
  packs: [
    { id: "pack_250", name: "250 responses", responses: 250, price: { LKR: 350000, USD: 1200 }, active: true },
    { id: "pack_1000", name: "1,000 responses", responses: 1000, price: { LKR: 1190000, USD: 3900 }, active: true },
    { id: "pack_5000", name: "5,000 responses", responses: 5000, price: { LKR: 4990000, USD: 15900 }, active: true },
  ],
};

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
export const isPackId = (v: unknown): v is PackId => typeof v === "string" && (PACK_IDS as readonly string[]).includes(v);

export type Quote = {
  kind: "plan" | "topup";
  item: PlanId | PackId;
  interval: BillingInterval | null;
  credits: number;
  amountMinor: number;
  currency: Currency;
  description: string;
};

/** Server-side price lookup. Returns null for anything that isn't in the catalog or isn't on sale. */
export function quote(catalog: Catalog, item: string, interval: BillingInterval | null | undefined, provider: Provider, currency: Currency = PROVIDER_CURRENCY[provider]): Quote | null {
  if (!PROVIDER_CURRENCIES[provider].includes(currency)) return null;
  if (isPlanId(item)) {
    if (interval !== "month" && interval !== "year") return null;
    const p = catalog.plans.find((x) => x.id === item && x.active);
    if (!p) return null;
    const credits = interval === "year" ? p.monthlyResponses * 12 : p.monthlyResponses;
    return {
      kind: "plan",
      item,
      interval,
      credits,
      amountMinor: p.price[currency][interval],
      currency,
      description: `TapTruly ${p.name} (${interval === "year" ? "yearly" : "monthly"}, ${credits.toLocaleString("en")} responses)`,
    };
  }
  if (isPackId(item)) {
    if (interval) return null;
    const k = catalog.packs.find((x) => x.id === item && x.active);
    if (!k) return null;
    return { kind: "topup", item, interval: null, credits: k.responses, amountMinor: k.price[currency], currency, description: `TapTruly ${k.responses.toLocaleString("en")} extra responses` };
  }
  return null;
}

/** "1490.00" style amount (PayHere wants 2 decimals). */
export function majorAmount(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function formatMoney(minor: number, currency: Currency): string {
  const n = (minor / 100).toLocaleString("en", { minimumFractionDigits: currency === "LKR" ? 0 : 2, maximumFractionDigits: 2 });
  return currency === "LKR" ? `Rs ${n}` : `$${n}`;
}

type CatalogRow = {
  item: string;
  kind: string;
  name: string;
  blurb: string;
  responses: number;
  lkr_month: number | null;
  lkr_year: number | null;
  usd_month: number | null;
  usd_year: number | null;
  lkr_price: number | null;
  usd_price: number | null;
  active: boolean;
  sort: number;
};

/** Database rows -> catalog. Anything missing or malformed falls back to the default for that item. */
export function catalogFromRows(rows: CatalogRow[] | null | undefined): Catalog {
  if (!rows || rows.length === 0) return DEFAULT_CATALOG;
  const byId = new Map(rows.map((r) => [r.item, r]));
  const n = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : fallback);
  const sortOf = (id: string) => Number(byId.get(id)?.sort ?? 0);
  return {
    plans: DEFAULT_CATALOG.plans
      .map((d) => {
        const r = byId.get(d.id);
        if (!r) return d;
        return {
          id: d.id,
          name: r.name || d.name,
          blurb: r.blurb ?? d.blurb,
          monthlyResponses: n(r.responses, d.monthlyResponses),
          price: {
            LKR: { month: n(r.lkr_month, d.price.LKR.month), year: n(r.lkr_year, d.price.LKR.year) },
            USD: { month: n(r.usd_month, d.price.USD.month), year: n(r.usd_year, d.price.USD.year) },
          },
          active: r.active !== false,
        };
      })
      .sort((a, b) => sortOf(a.id) - sortOf(b.id)),
    packs: DEFAULT_CATALOG.packs
      .map((d) => {
        const r = byId.get(d.id);
        if (!r) return d;
        return { id: d.id, name: r.name || d.name, responses: n(r.responses, d.responses), price: { LKR: n(r.lkr_price, d.price.LKR), USD: n(r.usd_price, d.price.USD) }, active: r.active !== false };
      })
      .sort((a, b) => sortOf(a.id) - sortOf(b.id)),
  };
}
