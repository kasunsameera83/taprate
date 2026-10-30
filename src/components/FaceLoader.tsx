// TapTruly's loader: a happy face in the brand colours that hops, grins, winks and throws a few sparkles,
// like a customer tapping "Excellent". Always happy, never a frown.
// Pure SVG + CSS (SMIL for the mouth, which works in every modern browser incl. Safari); no JavaScript.
// With reduced motion, a still smiling face is shown and only the label fades gently.

const SMILE = "M20 37 Q32 47 44 37 Q32 41 20 37 Z";
const GRIN = "M19 35 Q32 55 45 35 Q32 38 19 35 Z";
const DUR = "1.8s";

function Sparkle({ x, y, s, cls }: { x: number; y: number; s: number; cls: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className={cls} d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#fbbf24" />
    </g>
  );
}

function Face({ size, animated }: { size: number; animated: boolean }) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden overflow="visible">
      <defs>
        <linearGradient id="tt-face-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-brand-from, #3555f6)" />
          <stop offset="1" stopColor="var(--color-brand-to, #553cf7)" />
        </linearGradient>
      </defs>
      {/* shadow on the "floor": shrinks while the face is in the air */}
      <ellipse className={animated ? "tl-shadow" : undefined} cx="40" cy="74" rx="18" ry="3.2" fill="rgba(15,23,42,0.16)" />
      <g className={animated ? "tl-hop" : undefined}>
        <g transform="translate(8 8)">
          <circle cx="32" cy="32" r="28" fill="url(#tt-face-grad)" />
          <circle cx="24" cy="20" r="9" fill="#fff" opacity="0.14" />
          {/* rosy cheeks */}
          <circle cx="16" cy="36" r="4" fill="#f9a8d4" opacity="0.55" />
          <circle cx="48" cy="36" r="4" fill="#f9a8d4" opacity="0.55" />
          {/* eyes: blink on landing, wink at the top */}
          <g fill="#fff">
            <ellipse cx="23" cy="25" rx="3.4" ry="4.2">
              {animated && <animate attributeName="ry" values="4.2;4.2;0.7;4.2;4.2" keyTimes="0;0.82;0.88;0.94;1" dur={DUR} repeatCount="indefinite" />}
            </ellipse>
            <ellipse cx="41" cy="25" rx="3.4" ry="4.2">
              {animated && <animate attributeName="ry" values="4.2;4.2;0.7;0.7;4.2;4.2;0.7;4.2;4.2" keyTimes="0;0.3;0.36;0.5;0.56;0.82;0.88;0.94;1" dur={DUR} repeatCount="indefinite" />}
            </ellipse>
          </g>
          {/* mouth: a smile that opens into a big grin at the top of the hop */}
          <path d={SMILE} fill="#fff" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round">
            {animated && (
              <animate attributeName="d" values={[SMILE, SMILE, GRIN, GRIN, SMILE, SMILE].join(";")} keyTimes="0;0.2;0.36;0.56;0.72;1" dur={DUR} repeatCount="indefinite" calcMode="spline" keySplines="0 0 1 1;0.3 0 0.2 1;0 0 1 1;0.3 0 0.2 1;0 0 1 1" />
            )}
          </path>
        </g>
      </g>
      {animated && (
        <>
          <Sparkle x={8} y={12} s={0.9} cls="tl-spark tl-spark-1" />
          <Sparkle x={72} y={10} s={1.1} cls="tl-spark tl-spark-2" />
          <Sparkle x={74} y={40} s={0.7} cls="tl-spark tl-spark-3" />
        </>
      )}
    </svg>
  );
}

/** The face with an optional label. */
export function FaceLoader({ label = "Loading", size = 64, showLabel = true }: { label?: string; size?: number; showLabel?: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-2">
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

/**
 * For buttons while something is saving: a tiny hopping happy face before the text ("Saving…").
 * Uses the button's own text colour, so it works on primary, secondary and white buttons.
 */
export function Busy({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2" aria-live="polite">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="tl-mini shrink-0 overflow-visible">
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.22" />
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="8.6" cy="9.8" r="1.4" fill="currentColor" />
        <circle cx="15.4" cy="9.8" r="1.4" fill="currentColor" />
        <path d="M7.5 13.6 Q12 18.4 16.5 13.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </span>
  );
}
