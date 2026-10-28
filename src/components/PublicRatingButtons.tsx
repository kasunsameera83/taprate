import { ICON_SETS, type IconSetId } from "@/lib/surveys/iconSets";
import type { ResolvedOption } from "@/lib/surveys/customIcons";

/** Big, thumb-friendly rating buttons for public pages (share link, QR, widget). Plain links: work without JavaScript. */
export function PublicRatingButtons({
  iconSet,
  links,
  newTab = false,
  compact = false,
}: {
  iconSet: IconSetId;
  links: Array<ResolvedOption & { href: string }>;
  newTab?: boolean;
  compact?: boolean;
}) {
  const numeric = iconSet === "nps" || iconSet === "ces";
  const set = ICON_SETS[iconSet];
  return (
    <div>
      <ul className={`flex flex-wrap justify-center ${numeric ? "gap-1.5" : "gap-2"}`}>
        {links.map((o) => (
          <li key={o.value}>
            <a
              href={o.href}
              target={newTab ? "_blank" : undefined}
              rel="noopener noreferrer"
              aria-label={`Rate: ${o.label}`}
              className={`flex flex-col items-center justify-center rounded-[12px] border-2 bg-white text-center font-bold transition-transform active:scale-95 ${
                numeric ? `${compact ? "h-11 w-9" : "h-12 w-10 sm:h-14 sm:w-12"} text-lg text-ink` : `${compact ? "min-h-14 min-w-14 px-2" : "min-h-20 min-w-20 px-3"}`
              }`}
              style={{ borderColor: o.color }}
            >
              {o.imageUrl ? (
                <img src={o.imageUrl} alt="" width={compact ? 32 : 48} height={compact ? 32 : 48} className={`${compact ? "h-8 w-8" : "h-12 w-12"} object-contain`} />
              ) : (
                <span className={numeric ? "" : compact ? "text-2xl" : "text-4xl"} aria-hidden style={numeric ? undefined : { color: o.color }}>
                  {iconSet === "stars5" ? `${o.value}★` : o.symbol}
                </span>
              )}
              {!numeric && (iconSet !== "stars5" || o.imageUrl) && <span className="mt-0.5 text-[11px] font-semibold text-muted">{o.label}</span>}
            </a>
          </li>
        ))}
      </ul>
      {numeric && (
        <div className="mx-auto mt-2 flex max-w-md justify-between text-[12px] text-muted">
          <span>{set.options[0]!.label}</span>
          <span>{set.options.at(-1)!.label}</span>
        </div>
      )}
    </div>
  );
}
