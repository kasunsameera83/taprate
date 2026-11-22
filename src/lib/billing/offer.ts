// Welcome-offer countdown text. Counts down to the real deadline (sign-up + the offer's days); never resets.

/** "Ends in 5 days (28 Nov)", "Ends in 3 hours", or "Ends today". */
export function offerTimeLeft(endsAt: string, now = Date.now()): string {
  const ms = Date.parse(endsAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Ends today";
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `Ends in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(ms / 86_400_000);
  const date = new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `Ends in ${days} ${days === 1 ? "day" : "days"} (${date})`;
}

/** Dashboard pop-up: shown once when the offer appears, and once more on its last day. Never more. */
export type OfferPopupStage = "first" | "last";
export const offerPopupKey = (accountId: string, code: string) => `tt.welcomeOffer.${accountId}.${code}`;

export function offerPopupStage(stored: string | null, endsAt: string, now = Date.now()): OfferPopupStage | null {
  const left = Date.parse(endsAt) - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  if (stored !== "first" && stored !== "last") return left < 86_400_000 ? "last" : "first";
  if (stored === "first" && left < 86_400_000) return "last";
  return null;
}
