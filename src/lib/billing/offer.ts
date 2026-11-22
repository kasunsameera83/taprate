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

/** What the public site says about the welcome offer (no countdown: a visitor's days start at sign-up). */
export type PublicWelcomeOffer = { kind: "percent" | "amount" | "credits"; percentOff: number | null; bonusCredits: number | null; days: number; appliesTo: string[] };

const PLAN_ITEMS = new Set(["small", "starter", "growth", "scale"]);

export function publicOfferText(o: PublicWelcomeOffer): { id: string; title: string; body: string; pricing: string } | null {
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > 60) return null;
  const plansOnly = o.appliesTo.length > 0 && o.appliesTo.every((i) => PLAN_ITEMS.has(i));
  const what = plansOnly ? "plan" : "payment";
  let gift: string;
  if (o.kind === "percent" && o.percentOff && o.percentOff >= 1 && o.percentOff <= 90) gift = `${o.percentOff}% off your first ${what}`;
  else if (o.kind === "credits" && o.bonusCredits && o.bonusCredits > 0) gift = `${o.bonusCredits.toLocaleString("en")} bonus responses with your first ${what}`;
  else if (o.kind === "amount") gift = `money off your first ${what}`;
  else return null;
  const within = `within ${o.days} ${o.days === 1 ? "day" : "days"} of signing up`;
  return {
    // Changes when the offer changes, so a closed bar comes back for a new offer.
    id: `welcome-${o.kind}-${o.percentOff ?? o.bonusCredits ?? 0}-${o.days}`,
    title: `New here? ${gift.charAt(0).toUpperCase()}${gift.slice(1)}.`,
    body: `Start free, then choose a ${plansOnly ? "plan" : "plan or top-up"} ${within}.`,
    pricing: `🎁 New businesses get ${gift.replace("your first", "their first")} if they choose it ${within}.`,
  };
}
