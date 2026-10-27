"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { kioskRateSchema, publicCommentSchema } from "@/lib/validation/schemas";
import { sentimentOf, type IconSetId, type RatingOption } from "@/lib/surveys/iconSets";
import { readableTextOn } from "@/lib/surveys/color";

type Props = {
  token: string;
  question: string;
  iconSet: IconSetId;
  options: RatingOption[];
  brandColor: string;
  logo: string | null;
  business: string;
  active: boolean;
  thankYou: string;
  driversPositive: string[];
  driversNegative: string[];
};

const RESET_AFTER_MS = 8000;

export function KioskClient(p: Props) {
  const [stage, setStage] = useState<"ask" | "thanks">("ask");
  const [last, setLast] = useState<{ responseId: string; responseToken: string; rating: number } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const numeric = p.iconSet === "nps" || p.iconSet === "ces";
  const textOnBrand = readableTextOn(p.brandColor);

  const reset = () => {
    setStage("ask");
    setLast(null);
    setPicked([]);
    setError("");
  };
  const scheduleReset = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(reset, RESET_AFTER_MS);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function rate(rating: number) {
    const parsed = kioskRateSchema.safeParse({ kiosk: p.token, rating });
    if (!parsed.success || busy) return;
    setBusy(true);
    setError("");
    const r = await api<{ responseId: string; responseToken: string }>("/api/public/kiosk", { method: "POST", body: parsed.data });
    setBusy(false);
    if (!r.ok) {
      setError(r.status === 429 ? "One moment please, then tap again." : r.message);
      return;
    }
    setLast({ ...r.data, rating });
    setStage("thanks");
    scheduleReset();
  }

  async function toggle(label: string) {
    if (!last) return;
    const next = picked.includes(label) ? picked.filter((d) => d !== label) : [...picked, label];
    setPicked(next);
    scheduleReset(); // give them time to keep tapping
    const parsed = publicCommentSchema.safeParse({ responseId: last.responseId, token: last.responseToken, drivers: next });
    if (parsed.success) await api("/api/public/comment", { method: "POST", body: parsed.data });
  }

  const drivers = last ? (sentimentOf(p.iconSet, last.rating) === "positive" ? p.driversPositive : p.driversNegative) : [];

  return (
    <main className="flex min-h-screen select-none flex-col bg-surface" style={{ borderTop: `8px solid ${p.brandColor}` }}>
      <header className="flex justify-center px-6 pt-8">
        {p.logo ? <img src={p.logo} alt={p.business} className="max-h-16 max-w-[260px] object-contain" /> : <p className="text-lg font-semibold text-muted">{p.business}</p>}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        {!p.active ? (
          <p className="text-2xl text-muted">This kiosk isn&rsquo;t collecting ratings right now.</p>
        ) : stage === "ask" ? (
          <>
            <h1 className="max-w-3xl text-[34px] font-bold leading-tight sm:text-[44px]">{p.question}</h1>
            <ul className={`mt-10 flex flex-wrap justify-center ${numeric ? "gap-2" : "gap-4"}`}>
              {p.options.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => rate(o.value)}
                    aria-label={`Rate: ${o.label}`}
                    className={`flex flex-col items-center justify-center rounded-[20px] border-[3px] bg-white transition-transform active:scale-95 disabled:opacity-60 ${
                      numeric ? "h-20 w-16 text-3xl font-bold text-ink sm:h-24 sm:w-20" : "h-32 w-32 sm:h-40 sm:w-40"
                    }`}
                    style={{ borderColor: o.color }}
                  >
                    <span className={numeric ? "" : "text-6xl sm:text-7xl"} aria-hidden>
                      {p.iconSet === "stars5" ? `${o.value}★` : o.symbol}
                    </span>
                    {!numeric && <span className="mt-1 text-base font-semibold text-muted">{o.label}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="mt-6 text-lg text-neg-text">
                {error}
              </p>
            )}
          </>
        ) : (
          <div aria-live="polite">
            <h1 className="text-[40px] font-bold leading-tight">{p.thankYou}</h1>
            {drivers.length > 0 && (
              <>
                <p className="mt-8 text-xl text-muted">{sentimentOf(p.iconSet, last!.rating) === "positive" ? "What did we do well?" : "What could we do better?"}</p>
                <div className="mt-4 flex max-w-3xl flex-wrap justify-center gap-3">
                  {drivers.map((d) => {
                    const on = picked.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(d)}
                        className={`min-h-14 rounded-full border-2 px-6 text-lg font-semibold ${on ? "border-transparent" : "border-control bg-white text-ink"}`}
                        style={on ? { background: p.brandColor, color: textOnBrand } : undefined}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <button type="button" onClick={reset} className="btn btn-secondary mt-10 min-h-12 px-6 text-base">
              Done
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
