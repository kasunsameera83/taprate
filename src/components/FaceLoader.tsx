// TapTruly's loader: a face that turns from unhappy to happy, in the rating colours, then back again.
// Pure SVG (SMIL animation works in every modern browser, including Safari), no JavaScript.
// With reduced motion, a still happy face with a gently fading label is shown instead.

const FROWN = "M22 42 Q32 34 42 42";
const FLAT = "M22 40 Q32 40 42 40";
const SMILE = "M21 37 Q32 49 43 37";
const COLORS = "var(--color-neg-fill);var(--color-neu-fill);var(--color-pos-fill);var(--color-pos-fill);var(--color-neu-fill);var(--color-neg-fill)";
const MOUTHS = [FROWN, FLAT, SMILE, SMILE, FLAT, FROWN].join(";");
const TIMES = "0;0.2;0.42;0.58;0.8;1";

function Face({ size, animated }: { size: number; animated: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="drop-shadow-[0_10px_18px_rgba(15,23,42,0.18)]">
      <circle cx="32" cy="32" r="28" fill={animated ? "var(--color-neg-fill)" : "var(--color-pos-fill)"}>
        {animated && <animate attributeName="fill" values={COLORS} keyTimes={TIMES} dur="2.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0 0 1 1;0.4 0 0.2 1;0.4 0 0.2 1" />}
      </circle>
      {/* eyes blink now and then */}
      <g fill="#fff">
        <ellipse cx="23" cy="26" rx="3.2" ry="4">
          {animated && <animate attributeName="ry" values="4;4;0.6;4;4" keyTimes="0;0.46;0.5;0.54;1" dur="2.6s" repeatCount="indefinite" />}
        </ellipse>
        <ellipse cx="41" cy="26" rx="3.2" ry="4">
          {animated && <animate attributeName="ry" values="4;4;0.6;4;4" keyTimes="0;0.46;0.5;0.54;1" dur="2.6s" repeatCount="indefinite" />}
        </ellipse>
      </g>
      <path d={animated ? FROWN : SMILE} fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round">
        {animated && <animate attributeName="d" values={MOUTHS} keyTimes={TIMES} dur="2.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0 0 1 1;0.4 0 0.2 1;0.4 0 0.2 1" />}
      </path>
    </svg>
  );
}

/** The face with an optional label. */
export function FaceLoader({ label = "Loading", size = 56, showLabel = true }: { label?: string; size?: number; showLabel?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
      <span className="motion-reduce:hidden">
        <Face size={size} animated />
      </span>
      <span className="hidden motion-reduce:block">
        <Face size={size} animated={false} />
      </span>
      {showLabel ? <span className="fl-label text-sm font-semibold text-muted">{label}…</span> : <span className="sr-only">{label}…</span>}
    </div>
  );
}

/** Takes the place of a page's content while it loads, keeping roughly the same height (no jumping). */
export function PageLoader({ className = "h-64", label }: { className?: string; label?: string }) {
  return (
    <div className={`flex w-full items-center justify-center rounded-[var(--radius-panel)] border border-line bg-surface ${className}`} aria-busy="true">
      <FaceLoader label={label} />
    </div>
  );
}
