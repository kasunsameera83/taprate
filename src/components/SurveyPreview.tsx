// Live previews used in the survey editor. Built from React elements (never HTML strings),
// mirroring the real email markup in src/lib/surveys/snippet.ts. Links are inert.
import { ICON_SETS, type IconSetId } from "@/lib/surveys/iconSets";
import type { ResolvedOption } from "@/lib/surveys/customIcons";

export function EmailButtonsPreview({ iconSet, question, options }: { iconSet: IconSetId; question: string; options?: ResolvedOption[] }) {
  const set = ICON_SETS[iconSet];
  const opts = options ?? set.options.map((o) => ({ ...o, imageUrl: null as string | null }));
  const compact = set.id === "nps" || set.id === "ces";
  const showLabels = set.id === "thumbs" || set.id === "faces3" || set.id === "faces5";
  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <p className="mb-2 text-[15px] font-bold leading-5 text-[#111827]">{question || "Your question"}</p>
      <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
        {opts.map((o) => (
          <span
            key={o.value}
            className={`flex flex-col items-center justify-center rounded-[8px] border-2 bg-white text-center font-bold ${
              compact ? "min-w-[30px] px-0 py-2.5 text-[15px] leading-5" : "min-w-[48px] px-2.5 py-2 text-[22px] leading-[26px]"
            }`}
            style={{ borderColor: o.color, color: compact ? "#111827" : o.color }}
            title={o.label}
          >
            {o.imageUrl ? <img src={o.imageUrl} alt="" className="mx-auto mb-0.5 h-9 w-9 object-contain" /> : set.id === "stars5" ? `${o.value}★` : o.symbol}
            {(showLabels || o.imageUrl) && <span className="text-[11px] leading-[14px] text-[#374151]">{o.label}</span>}
          </span>
        ))}
      </div>
      {compact && (
        <div className="mt-1 flex justify-between text-[11px] text-[#374151]">
          <span>{set.id === "ces" ? "1 = Very difficult" : "0 = Not likely"}</span>
          <span>{set.id === "ces" ? "7 = Very easy" : "10 = Very likely"}</span>
        </div>
      )}
    </div>
  );
}

/** A believable inbox frame so people can judge the buttons in context. */
export function EmailFrame({ children, from = "You", subject = "Re: Your support request" }: { children: React.ReactNode; from?: string; subject?: string }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_1px_0_rgba(21,26,45,0.04)]">
      <div className="border-b border-line bg-[#fafbfc] px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">{subject}</p>
        <p className="text-[12px] text-muted">From {from}</p>
      </div>
      <div className="space-y-3 px-4 py-4 text-[14px] leading-relaxed text-[#1f2937]">
        <p>Hi Amaya,</p>
        <p>Your order has been updated and the replacement ships today. Let me know if there&rsquo;s anything else.</p>
        <div className="border-t border-dashed border-line pt-3 text-[13px] text-muted">
          <p className="font-semibold text-ink">{from}</p>
          <p>Customer support</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ThanksPreview({
  question,
  message,
  brandColor,
  allowComment,
  drivers = [],
  reviewLabel = null,
}: {
  question: string;
  message: string;
  brandColor: string;
  allowComment: boolean;
  drivers?: string[];
  reviewLabel?: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[22px] border-[6px] border-ink bg-canvas">
      <div className="h-1.5" style={{ background: brandColor }} />
      <div className="space-y-2 px-4 py-5 text-center">
        <p className="text-[11px] text-muted">{question || "Your question"}</p>
        <p className="text-3xl" aria-hidden>
          😍
        </p>
        <p className="text-[12px] font-semibold text-pos-text">Excellent</p>
        <p className="font-display text-[15px] font-bold leading-snug">{message || "Thanks for your feedback!"}</p>
        {reviewLabel && <div className="mt-2 rounded-[8px] py-1.5 text-[10px] font-semibold text-white" style={{ background: brandColor }}>{reviewLabel}</div>}
        {drivers.length > 0 && (
          <div className="pt-1 text-left">
            <p className="text-[10px] font-semibold">What did we do well?</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {drivers.slice(0, 6).map((d) => (
                <span key={d} className="rounded-full border border-control bg-white px-2 py-0.5 text-[9px]">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}
        {allowComment && (
          <div className="pt-1 text-left">
            <p className="text-[10px] font-semibold">Anything you&rsquo;d like to add?</p>
            <div className="mt-1 h-12 rounded-[8px] border border-control bg-white" />
            <div className="mt-2 h-7 rounded-[8px]" style={{ background: brandColor }} />
          </div>
        )}
      </div>
    </div>
  );
}
