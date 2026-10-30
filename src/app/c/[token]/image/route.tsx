import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { verifyCardToken } from "@/lib/security/signing";
import { loadShareCard, type ShareCard } from "@/lib/share/card";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Opts = { square: boolean; logo: string | null; plain: boolean };

// The share-card picture. Wide (1200×630) for link previews on WhatsApp/Facebook/LinkedIn/X, or square
// (1080×1080, ?size=square) to post on Instagram. Everything drawn is plain text; no customer email.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.publicPerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return new Response("Too many requests", { status: 429 });
  const id = verifyCardToken(e.linkSecrets, (await ctx.params).token);
  const card = id ? await loadShareCard(id) : null;
  if (!card) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const square = req.nextUrl.searchParams.get("size") === "square";
  // The picture is drawn on the server, which reads PNG and JPEG logos; a WebP logo is left out.
  const logo = card.logo && /\.(png|jpe?g)$/i.test(card.logo) ? card.logo : null;

  // Render now (not while streaming), so if anything fails we can fall back to a simpler picture.
  for (const opts of [{ square, logo, plain: false }, { square, logo: null, plain: true }] satisfies Opts[]) {
    try {
      const img = draw(card, opts);
      const bytes = await img.arrayBuffer();
      return new Response(bytes, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=300", "X-Robots-Tag": "noindex" },
      });
    } catch (err) {
      console.error("[share-card] drawing failed", { plain: opts.plain, err: String(err) });
    }
  }
  return new Response("Couldn't make the picture", { status: 500, headers: { "Cache-Control": "no-store" } });
}

function draw(card: ShareCard, { square, logo, plain }: Opts) {
  const W = square ? 1080 : 1200;
  const H = square ? 1080 : 630;
  const len = card.comment.length;
  const size = square ? (len > 180 ? 44 : len > 90 ? 54 : 64) : len > 180 ? 34 : len > 90 ? 42 : 52;
  const starSize = square ? 52 : 42;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", backgroundColor: card.color, padding: square ? 64 : 48 }}>
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", backgroundColor: "#ffffff", borderRadius: 36, padding: square ? 72 : 56 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {card.stars !== null && !plain ? (
              <div style={{ display: "flex" }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <svg key={i} width={starSize} height={starSize} viewBox="0 0 24 24" style={{ marginRight: 6 }}>
                    <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill={i <= (card.stars ?? 0) ? "#f59e0b" : "#e2e8f0"} />
                  </svg>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "10px 24px", fontSize: square ? 32 : 26 }}>
                {card.label ?? "Excellent"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", fontSize: size, lineHeight: 1.3, color: "#0f172a", marginTop: 24 }}>
            {`“${card.comment}”`}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: square ? 34 : 28, color: "#0f172a" }}>{card.name}</div>
              <div style={{ display: "flex", fontSize: square ? 26 : 22, color: "#64748b" }}>{`about ${card.businessName}`}</div>
            </div>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={square ? 240 : 200} height={square ? 90 : 72} style={{ objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex" }} />
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: square ? 28 : 18, color: "#ffffff", fontSize: square ? 26 : 20 }}>
          {card.branding ? "Collected with TapTruly · taptruly.com" : " "}
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}
