import type { Sentiment } from "@/lib/surveys/iconSets";

const FILL: Record<Sentiment, string> = { positive: "var(--color-pos-fill)", neutral: "var(--color-neu-fill)", negative: "var(--color-neg-fill)" };
const HEIGHT: Record<Sentiment, string> = { positive: "100%", neutral: "66%", negative: "40%" };

/**
 * The signature element: one tick per rating, oldest on the left, newest on the right.
 * Height also encodes sentiment, so it reads without colour; a text summary is provided for screen readers.
 */
export function FeedbackStripe({
  items,
  slots = 60,
  height = 56,
  highlightNewest = false,
}: {
  items: ReadonlyArray<{ sentiment: Sentiment }>; // newest first
  slots?: number;
  height?: number;
  highlightNewest?: boolean;
}) {
  const shown = items.slice(0, slots).reverse();
  const empty = Math.max(0, slots - shown.length);
  const counts = shown.reduce((acc, i) => ({ ...acc, [i.sentiment]: acc[i.sentiment] + 1 }), { positive: 0, neutral: 0, negative: 0 } as Record<Sentiment, number>);

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden>
        {Array.from({ length: empty }, (_, i) => (
          <span key={`e${i}`} className="h-[18%] min-w-0 flex-1 rounded-[3px] bg-[#e6e8ee]" />
        ))}
        {shown.map((item, i) => (
          <span
            key={i}
            className={`tick min-w-0 flex-1 rounded-[3px] ${highlightNewest && i === shown.length - 1 ? "tick-new" : ""}`}
            style={{ height: HEIGHT[item.sentiment], background: FILL[item.sentiment] }}
          />
        ))}
      </div>
      <p className="sr-only">
        Last {shown.length} ratings: {counts.positive} positive, {counts.neutral} neutral, {counts.negative} negative.
      </p>
    </div>
  );
}
