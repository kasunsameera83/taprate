// Promo codes: the rules for whether a code works and what it does to a price. Pure, unit-tested.
// The server runs this with the real usage counts; the browser only ever shows the server's answer.
import type { Currency, Quote } from "./catalog.ts";

export type PromoKind = "percent" | "amount" | "credits";

export type Promo = {
  id: string;
  code: string;
  description: string;
  kind: PromoKind;
  percentOff: number | null;
  amountOffLkr: number | null;
  amountOffUsd: number | null;
  bonusCredits: number | null;
  appliesTo: string[]; // empty = everything
  maxUses: number | null;
  startsAt: string;
  endsAt: string | null;
  enabled: boolean;
  /** Welcome offer: only for businesses that signed up within this many days and have never paid. */
  newBusinessDays?: number | null;
};

/** What the welcome-offer rule needs to know about the business. */
export type PromoBusiness = { createdAt: string | null; hasPaid: boolean };

/** When a welcome offer stops working for this business (sign-up + N days, or the code's own end, whichever is first). */
export function welcomeOfferEnds(promo: Pick<Promo, "newBusinessDays" | "endsAt">, createdAt: string): number | null {
  if (!promo.newBusinessDays) return null;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return null;
  const own = created + promo.newBusinessDays * 86_400_000;
  const codeEnd = promo.endsAt ? Date.parse(promo.endsAt) : Infinity;
  return Math.min(own, codeEnd);
}

/** Smallest amount we'll ask a provider to charge (Stripe's minimum is $0.50). */
export const MIN_CHARGE: Record<Currency, number> = { LKR: 10000, USD: 50 };

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z0-9_-]{4,30}$/.test(c) ? c : null;
}

export type PromoResult =
  | { ok: true; quote: Quote & { listAmountMinor: number; discountMinor: number; bonusCredits: number; promoId: string; promoCode: string }; summary: string }
  | { ok: false; reason: string };

/** Same message for "doesn't exist", "switched off" and "not started", so codes can't be probed. */
export const INVALID_CODE = "That code isn't valid.";

export function applyPromo(
  promo: Promo | null,
  q: Quote,
  usage: { total: number; usedByThisBusiness: boolean; business?: PromoBusiness },
  now: number = Date.now(),
): PromoResult {
  if (!promo || !promo.enabled || Date.parse(promo.startsAt) > now) return { ok: false, reason: INVALID_CODE };
  if (promo.endsAt && Date.parse(promo.endsAt) <= now) return { ok: false, reason: "That code has expired." };
  if (usage.usedByThisBusiness) return { ok: false, reason: "You've already used that code." };
  if (promo.newBusinessDays) {
    const b = usage.business;
    const ends = b?.createdAt ? welcomeOfferEnds(promo, b.createdAt) : null;
    if (!b || b.hasPaid || ends === null || now >= ends) return { ok: false, reason: `That offer is only for new businesses in their first ${promo.newBusinessDays} days.` };
  }
  if (promo.maxUses !== null && usage.total >= promo.maxUses) return { ok: false, reason: "That code has been fully used." };
  if (promo.appliesTo.length > 0 && !promo.appliesTo.includes(q.item)) return { ok: false, reason: "That code doesn't apply to this plan or pack." };

  const list = q.amountMinor;
  let amount = list;
  let bonus = 0;
  if (promo.kind === "percent" && promo.percentOff) {
    amount = Math.round((list * (100 - promo.percentOff)) / 100);
  } else if (promo.kind === "amount") {
    const off = q.currency === "LKR" ? promo.amountOffLkr : promo.amountOffUsd;
    if (!off) return { ok: false, reason: `That code can't be used when paying in ${q.currency}.` };
    amount = list - off;
  } else if (promo.kind === "credits" && promo.bonusCredits) {
    bonus = promo.bonusCredits;
  } else {
    return { ok: false, reason: INVALID_CODE };
  }
  if (amount < MIN_CHARGE[q.currency]) return { ok: false, reason: "That code can't be used on this item." };

  const summary =
    promo.kind === "credits"
      ? `+${bonus.toLocaleString("en")} bonus responses`
      : q.kind === "plan" && !q.months
        ? `${promo.kind === "percent" ? `${promo.percentOff}%` : "Discount"} off every ${q.interval === "year" ? "year" : "month"} of this plan`
        : `${promo.kind === "percent" ? `${promo.percentOff}%` : "Discount"} off`;
  return {
    ok: true,
    summary,
    quote: {
      ...q,
      amountMinor: amount,
      listAmountMinor: list,
      discountMinor: list - amount,
      bonusCredits: bonus,
      promoId: promo.id,
      promoCode: promo.code,
      description: `${q.description}${promo.kind === "credits" ? ` + ${bonus} bonus` : ""} (code ${promo.code})`,
    },
  };
}
