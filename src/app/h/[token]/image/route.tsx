import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { verifyHighlightsToken } from "@/lib/security/signing";
import { loadHighlights, type Highlights } from "@/lib/share/highlights";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Our month" picture: wide for link previews, square (?size=square) for Instagram. Text only, no emails.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.publicPerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return new Response("Too many requests", { status: 429 });
  const t = verifyHighlightsToken(e.linkSecrets, (await ctx.params).token);
  const h = t ? await loadHighlights(t.accountId, t.month) : null;
  if (!h) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const square = req.nextUrl.searchParams.get("size") === "square";
  const logo = h.logo && /\.(png|jpe?g)$/i.test(h.logo) ? h.logo : null;
  for (const withLogo of [true, false]) {
    try {
      const bytes = await draw(h, square, withLogo ? logo : null).arrayBuffer();
      return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=600, s-maxage=600", "X-Robots-Tag": "noindex" } });
    } catch (err) {
      console.error("[highlights] drawing failed", { withLogo, err: String(err) });
    }
  }
  return new Response("Couldn't make the picture", { status: 500, headers: { "Cache-Control": "no-store" } });
}

function draw(h: Highlights, square: boolean, logo: string | null) {
  const W = square ? 1080 : 1200;
  const H = square ? 1080 : 630;
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", backgroundImage: "linear-gradient(135deg, #3555f6, #553cf7)", padding: square ? 72 : 56, color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: square ? 34 : 28, opacity: 0.85 }}>{h.monthLabel}</div>
            <div style={{ display: "flex", fontSize: square ? 56 : 46 }}>{h.businessName}</div>
          </div>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={square ? 200 : 170} height={square ? 80 : 68} style={{ objectFit: "contain", borderRadius: 12 }} />
          ) : (
            <div style={{ display: "flex" }} />
          )}
        </div>
        <div style={{ display: "flex", flexGrow: 1, alignItems: "center", marginTop: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", marginRight: square ? 0 : 56, flexGrow: 1 }}>
            <div style={{ display: "flex", fontSize: square ? 200 : 170, lineHeight: 1 }}>{`${h.happyPct}%`}</div>
            <div style={{ display: "flex", fontSize: square ? 40 : 34, opacity: 0.9 }}>happy customers</div>
            <div style={{ display: "flex", fontSize: square ? 32 : 26, opacity: 0.8, marginTop: 10 }}>{`from ${h.total.toLocaleString("en")} ratings`}</div>
          </div>
          {h.quote && !square && (
            <div style={{ display: "flex", flexDirection: "column", width: 440, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 28, padding: 32 }}>
              <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35 }}>{`“${h.quote.text}”`}</div>
              <div style={{ display: "flex", fontSize: 22, opacity: 0.85, marginTop: 14 }}>{`— ${h.quote.name}`}</div>
            </div>
          )}
        </div>
        {h.quote && square && (
          <div style={{ display: "flex", flexDirection: "column", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 28, padding: 36, marginBottom: 24 }}>
            <div style={{ display: "flex", fontSize: 34, lineHeight: 1.35 }}>{`“${h.quote.text}”`}</div>
            <div style={{ display: "flex", fontSize: 26, opacity: 0.85, marginTop: 14 }}>{`— ${h.quote.name}`}</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", fontSize: square ? 24 : 20, opacity: 0.85 }}>
          {h.branding ? "Thank you to every customer · Collected with TapTruly" : "Thank you to every customer"}
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}
