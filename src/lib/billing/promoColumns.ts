import type { PromoCodeInput } from "@/lib/validation/schemas";

/** Only the fields that belong to the chosen kind are kept (the database insists on this too). */
export function promoColumns(b: PromoCodeInput) {
  return {
    description: b.description,
    percent_off: b.kind === "percent" ? b.percentOff : null,
    amount_off_lkr: b.kind === "amount" ? b.amountOffLkr : null,
    amount_off_usd: b.kind === "amount" ? b.amountOffUsd : null,
    bonus_credits: b.kind === "credits" ? b.bonusCredits : null,
    applies_to: [...new Set(b.appliesTo)],
    max_uses: b.maxUses,
    starts_at: b.startsAt,
    ends_at: b.endsAt,
    enabled: b.enabled,
  };
}
