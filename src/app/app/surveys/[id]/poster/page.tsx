"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, qs } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { ICON_SETS } from "@/lib/surveys/iconSets";
import { Segmented, LoadError } from "@/components/ui";
import { PageLoader, Busy } from "@/components/FaceLoader";
import { IconArrowLeft, IconDownload } from "@/components/icons";
import type { Lang } from "@/lib/i18n/public";

// A printable "Scan to rate us" poster: business logo, the survey question, the QR code and the faces.
// Print it (or "Save as PDF") straight from the browser, or download a PNG for Canva, WhatsApp or a printer.
// Everything comes from the signed-in user's own API calls; nothing here is sent anywhere.

type Share = { location: { id: string; name: string } | null; qr: { link: string; svg: string } };
type Account = { name: string | null; account: { logoUrl: string | null } | null };
type Size = "a5" | "a4";

const SCAN: Record<Lang, { scan: string; seconds: string }> = {
  en: { scan: "Scan with your phone camera and tap a face", seconds: "It takes 5 seconds. No app or sign-up." },
  si: { scan: "ඔබගේ දුරකථන කැමරාවෙන් ස්කෑන් කර මුහුණක් තට්ටු කරන්න", seconds: "තත්පර 5ක් පමණයි." },
  ta: { scan: "உங்கள் போன் கேமராவால் ஸ்கேன் செய்து ஒரு முகத்தைத் தட்டுங்கள்", seconds: "5 வினாடிகள் மட்டுமே." },
};

function Poster() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const locationId = search.get("locationId") ?? undefined;
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [acct, setAcct] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [size, setSize] = useState<Size>("a5");
  const [busy, setBusy] = useState(false);
  const qrImg = useRef<HTMLImageElement>(null);
  const logoImg = useRef<HTMLImageElement>(null);

  const load = useCallback(() => {
    setError("");
    Promise.all([
      api<Survey>(`/api/surveys/${encodeURIComponent(id)}`),
      api<Share>(`/api/surveys/${encodeURIComponent(id)}/share${qs({ locationId })}`),
      api<Account>("/api/account"),
    ]).then(([s, sh, a]) => {
      if (!s.ok) return setError(s.message);
      if (!sh.ok) return setError(sh.message);
      setSurvey(s.data);
      setShare(sh.data);
      setAcct(a.ok ? a.data : null);
    });
  }, [id, locationId]);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!survey || !share) return <PageLoader className="h-96" />;

  const lang = survey.language;
  const words = SCAN[lang] ?? SCAN.en;
  const faces = ICON_SETS[survey.iconSet].options;
  const numeric = survey.iconSet === "nps" || survey.iconSet === "ces";
  const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(share.qr.svg)}`;
  const business = acct?.name ?? "";
  const logo = acct?.account?.logoUrl ?? null;

  /** Draw the poster on a canvas (A5 or A4 at 150 dpi) and download it as a PNG. */
  async function downloadPng() {
    setBusy(true);
    try {
      let url: string;
      try {
        url = drawPoster(true).toDataURL("image/png");
      } catch {
        // The logo's server didn't allow drawing it: make the picture with the business name instead.
        url = drawPoster(false).toDataURL("image/png");
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `rate-us-poster-${size}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  function drawPoster(withLogo: boolean): HTMLCanvasElement {
    {
      const W = size === "a4" ? 1240 : 874;
      const H = size === "a4" ? 1754 : 1240;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, W, H);
      g.fillStyle = survey!.brandColor;
      g.fillRect(0, 0, W, Math.round(H * 0.012));
      const font = getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
      let y = Math.round(H * 0.07);
      const l = logoImg.current;
      if (withLogo && l && l.complete && l.naturalWidth > 0) {
        const ratio = l.naturalWidth / l.naturalHeight;
        let h = Math.round(H * 0.07);
        let w = ratio * h;
        if (w > W * 0.5) {
          w = W * 0.5;
          h = w / ratio;
        }
        try {
          g.drawImage(l, (W - w) / 2, y, w, h);
        } catch {
          /* logo couldn't be drawn: the business name below is enough */
        }
        y += h + Math.round(H * 0.03);
      } else if (business) {
        g.fillStyle = "#0f172a";
        g.font = `700 ${Math.round(W * 0.045)}px ${font}`;
        g.textAlign = "center";
        g.fillText(business, W / 2, y + Math.round(W * 0.04));
        y += Math.round(H * 0.07);
      }
      g.fillStyle = "#0f172a";
      g.textAlign = "center";
      g.font = `800 ${Math.round(W * 0.075)}px ${font}`;
      y = wrap(g, survey!.question, W / 2, y + Math.round(W * 0.07), W * 0.84, Math.round(W * 0.088));
      g.font = `500 ${Math.round(W * 0.034)}px ${font}`;
      g.fillStyle = "#475569";
      y = wrap(g, words.scan, W / 2, y + Math.round(W * 0.03), W * 0.8, Math.round(W * 0.045));
      const q = qrImg.current!;
      const qs_ = Math.round(W * 0.56);
      const qy = y + Math.round(H * 0.03);
      g.drawImage(q, (W - qs_) / 2, qy, qs_, qs_);
      y = qy + qs_ + Math.round(H * 0.05);
      if (!numeric) {
        g.font = `${Math.round(W * 0.075)}px ${font}`;
        const gap = Math.round(W * 0.11);
        const startX = W / 2 - ((faces.length - 1) * gap) / 2;
        faces.forEach((f, i) => g.fillText(survey!.iconSet === "stars5" ? "★" : f.symbol, startX + i * gap, y));
        y += Math.round(H * 0.04);
      }
      g.font = `500 ${Math.round(W * 0.028)}px ${font}`;
      g.fillStyle = "#64748b";
      g.fillText(words.seconds, W / 2, y + Math.round(H * 0.02));
      return c;
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href={`/app/surveys/${encodeURIComponent(id)}`} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft className="h-4 w-4" />
          {survey.name}
        </Link>
        <h1 className="text-[28px] font-bold leading-tight">Printable QR poster</h1>
        <p className="text-sm text-muted">
          Put it on your counter, tables, reception or packaging. Customers scan it with their phone camera and tap a face.
          {share.location ? ` This poster is for ${share.location.name}.` : ""}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Paper size"
          value={size}
          onChange={setSize}
          options={[
            { value: "a5", label: "A5 (counter)" },
            { value: "a4", label: "A4 (wall)" },
          ]}
        />
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={downloadPng}>
          {busy ? <Busy>Making picture…</Busy> : (
            <>
              <IconDownload className="h-4 w-4" />
              Download picture (PNG)
            </>
          )}
        </button>
      </div>
      <p className="text-[13px] text-muted">Tip: when printing, choose &ldquo;Save as PDF&rdquo; to send it to a print shop. Scan it with your own phone once to check it works.</p>

      {/* What prints: only this area (see .print-area in globals.css). */}
      <style>{`@media print { @page { size: ${size === "a4" ? "A4" : "A5"} portrait; margin: 0; } }`}</style>
      <div className="flex justify-center rounded-[var(--radius-panel)] bg-canvas p-4 sm:p-8">
        <article
          className="print-area flex w-full max-w-[420px] flex-col items-center bg-white px-8 pb-10 pt-0 text-center shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] print:max-w-none print:shadow-none"
          style={{ aspectRatio: size === "a4" ? "210 / 297" : "148 / 210" }}
        >
          <div className="h-2 w-[calc(100%+4rem)]" style={{ background: survey.brandColor }} aria-hidden />
          <div className="mt-8 flex min-h-12 items-center justify-center">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img ref={logoImg} src={logo} alt={business} crossOrigin="anonymous" className="max-h-14 max-w-[60%] object-contain" />
            ) : (
              <p className="text-xl font-bold text-ink">{business}</p>
            )}
          </div>
          <h2 className="mt-6 text-[30px] font-extrabold leading-tight text-ink">{survey.question}</h2>
          <p className="mt-3 text-[15px] font-medium text-muted">{words.scan}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={qrImg} src={qrDataUrl} alt="QR code to rate us" className="mt-6 aspect-square w-[62%]" />
          {!numeric && (
            <p className="mt-6 flex gap-3 text-[34px] leading-none" aria-hidden>
              {faces.map((f) => (
                <span key={f.value}>{survey.iconSet === "stars5" ? "★" : f.symbol}</span>
              ))}
            </p>
          )}
          <p className="mt-auto pt-6 text-[13px] text-faint">{words.seconds}</p>
        </article>
      </div>
    </div>
  );
}

/** Centre-aligned word wrap on a canvas; returns the y below the last line. */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number): number {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > max && line) {
      g.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else line = next;
  }
  if (line) g.fillText(line, x, yy);
  return yy + lh * 0.4;
}

export default function PosterPage() {
  return (
    <Suspense>
      <Poster />
    </Suspense>
  );
}
