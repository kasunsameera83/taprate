// Rating scales. Shared by validation, snippet builder, thank-you page and reports.

export const ICON_SET_IDS = ["thumbs", "faces3", "faces5", "stars5", "nps", "ces"] as const;
export type IconSetId = (typeof ICON_SET_IDS)[number];

export type RatingOption = { value: number; label: string; symbol: string; color: string };

export type IconSet = {
  id: IconSetId;
  name: string;
  min: number;
  max: number;
  /** A rating at or above this counts as "satisfied" (positive) in reports. */
  positiveFrom: number;
  /** A rating at or below this counts as negative (needs follow-up). Between the two is neutral.
   *  Must match public.rating_sentiment() in supabase/migrations/0002_sentiment.sql. */
  negativeTo: number;
  options: RatingOption[];
};

const RED = "#dc2626";
const ORANGE = "#ea580c";
const AMBER = "#d97706";
const LIME = "#65a30d";
const GREEN = "#16a34a";

export const ICON_SETS: Record<IconSetId, IconSet> = {
  thumbs: {
    id: "thumbs",
    name: "Thumbs up / down",
    min: 1,
    max: 2,
    positiveFrom: 2,
    negativeTo: 1,
    options: [
      { value: 1, label: "Not helpful", symbol: "👎", color: RED },
      { value: 2, label: "Helpful", symbol: "👍", color: GREEN },
    ],
  },
  faces3: {
    id: "faces3",
    name: "3 faces",
    min: 1,
    max: 3,
    positiveFrom: 3,
    negativeTo: 1,
    options: [
      { value: 1, label: "Unhappy", symbol: "😞", color: RED },
      { value: 2, label: "Okay", symbol: "😐", color: AMBER },
      { value: 3, label: "Happy", symbol: "😀", color: GREEN },
    ],
  },
  faces5: {
    id: "faces5",
    name: "5 faces",
    min: 1,
    max: 5,
    positiveFrom: 4,
    negativeTo: 2,
    options: [
      { value: 1, label: "Very poor", symbol: "😡", color: RED },
      { value: 2, label: "Poor", symbol: "🙁", color: ORANGE },
      { value: 3, label: "Okay", symbol: "😐", color: AMBER },
      { value: 4, label: "Good", symbol: "🙂", color: LIME },
      { value: 5, label: "Excellent", symbol: "😍", color: GREEN },
    ],
  },
  stars5: {
    id: "stars5",
    name: "5 stars",
    min: 1,
    max: 5,
    positiveFrom: 4,
    negativeTo: 2,
    options: [1, 2, 3, 4, 5].map((n) => ({
      value: n,
      label: `${n} star${n > 1 ? "s" : ""}`,
      symbol: "★".repeat(n),
      color: [RED, ORANGE, AMBER, LIME, GREEN][n - 1] as string,
    })),
  },
  nps: {
    id: "nps",
    name: "NPS (0–10)",
    min: 0,
    max: 10,
    positiveFrom: 9,
    negativeTo: 6,
    options: Array.from({ length: 11 }, (_, n) => ({
      value: n,
      label: String(n),
      symbol: String(n),
      color: n <= 6 ? RED : n <= 8 ? AMBER : GREEN,
    })),
  },
  ces: {
    id: "ces",
    name: "Effort (1–7)",
    min: 1,
    max: 7,
    positiveFrom: 5,
    negativeTo: 3,
    options: [
      { value: 1, label: "Very difficult", symbol: "1", color: RED },
      { value: 2, label: "Difficult", symbol: "2", color: RED },
      { value: 3, label: "Somewhat difficult", symbol: "3", color: ORANGE },
      { value: 4, label: "Neither", symbol: "4", color: AMBER },
      { value: 5, label: "Somewhat easy", symbol: "5", color: LIME },
      { value: 6, label: "Easy", symbol: "6", color: GREEN },
      { value: 7, label: "Very easy", symbol: "7", color: GREEN },
    ],
  },
};

/** Scales shown as numbered buttons (no emoji). */
export function isNumericScale(id: IconSetId): boolean {
  return id === "nps" || id === "ces";
}

export function isIconSetId(value: unknown): value is IconSetId {
  return typeof value === "string" && (ICON_SET_IDS as readonly string[]).includes(value);
}

export function isValidRating(iconSet: IconSetId, rating: number): boolean {
  const set = ICON_SETS[iconSet];
  return Number.isInteger(rating) && rating >= set.min && rating <= set.max;
}

export function ratingOption(iconSet: IconSetId, rating: number): RatingOption | undefined {
  return ICON_SETS[iconSet].options.find((o) => o.value === rating);
}

export type Sentiment = "positive" | "neutral" | "negative";
export const SENTIMENTS: readonly Sentiment[] = ["positive", "neutral", "negative"];

export function sentimentOf(iconSet: IconSetId, rating: number): Sentiment {
  const set = ICON_SETS[iconSet];
  if (rating >= set.positiveFrom) return "positive";
  if (rating <= set.negativeTo) return "negative";
  return "neutral";
}

/** Shared sentiment colours (also used in emails, so plain hex). */
export const SENTIMENT_COLORS: Record<Sentiment, string> = {
  positive: "#16a34a",
  neutral: "#d97706",
  negative: "#dc2626",
};
