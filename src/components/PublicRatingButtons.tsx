import type { IconSetId } from "@/lib/surveys/iconSets";
import type { ResolvedOption } from "@/lib/surveys/customIcons";
import { pt, type Lang } from "@/lib/i18n/public";

/** Big, thumb-friendly rating buttons for public pages (share link, QR, widget). Plain links: work without JavaScript. */
export function PublicRatingButtons({
  iconSet,
  links,
  newTab = false,
  compact = false,
  lang = "en",
}: {
  iconSet: IconSetId;
  links: Array<ResolvedOption & { href: string }>;
  newTab?: boolean;
  compact?: boolean;
  lang?: Lang;
}) {
  const numeric = iconSet === "nps" || iconSet === "ces";
  return (
    <div>
      {/* Faces, stars and thumbs sit in one row that shares the width (they shrink on small phones);
          0-10 and 1-7 scales wrap. */}
      <ul
        className={numeric ? "flex flex-wrap justify-center gap-1.5" : "mx-auto grid max-w-md grid-flow-col auto-cols-fr gap-1.5 sm:gap-2"}
      >
        {links.map((o) => (
          <li key={o.value} className={numeric ? undefined : "min-w-0"}>
            <a
              href={o.href}
              target={newTab ? "_blank" : undefined}
              rel="noopener noreferrer"
              aria-label={`${pt(lang, "rate")}: ${o.label}`}
              className={`flex flex-col items-center justify-center rounded-[12px] border-2 bg-white text-center font-bold transition-transform active:scale-95 ${
                numeric ? `${compact ? "h-11 w-9" : "h-12 w-10 sm:h-14 sm:w-12"} text-lg text-ink` : `w-full px-1 ${compact ? "min-h-14 py-1.5" : "min-h-[76px] py-2 sm:min-h-20"}`
              }`}
              style={{ borderColor: o.color }}
            >
              {o.imageUrl ? (
                <img src={o.imageUrl} alt="" width={compact ? 32 : 48} height={compact ? 32 : 48} className={`${compact ? "h-8 w-8" : "h-10 w-10 sm:h-12 sm:w-12"} object-contain`} />
              ) : (
                <span className={numeric ? "" : compact ? "text-2xl" : "text-[32px] leading-none sm:text-4xl"} aria-hidden style={numeric ? undefined : { color: o.color }}>
                  {iconSet === "stars5" ? `${o.value}★` : o.symbol}
                </span>
              )}
              {!numeric && (iconSet !== "stars5" || o.imageUrl) && <span className="mt-1 w-full break-words text-[10px] font-semibold leading-tight text-muted sm:text-[11px]">{o.label}</span>}
            </a>
          </li>
        ))}
      </ul>
      {numeric && (
        <div className="mx-auto mt-2 flex max-w-md justify-between text-[12px] text-muted">
          <span>{iconSet === "nps" ? pt(lang, "npsLow") : links[0]?.label}</span>
          <span>{iconSet === "nps" ? pt(lang, "npsHigh") : links.at(-1)?.label}</span>
        </div>
      )}
    </div>
  );
}
