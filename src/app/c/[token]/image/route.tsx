import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { verifyCardToken } from "@/lib/security/signing";
import { loadShareCard } from "@/lib/share/card";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The share-card picture. Wide (1200×630) for link previews on WhatsApp/Facebook/LinkedIn/X, or square
// (1080×1080, ?size=square) to post on Instagram. Everything drawn is plain text; no customer email.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.publicPerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return new Response("Too many requests", { status: 429 });
  const id = verifyCardToken(e.linkSecrets, (await ctx.params).token);
  const card = id ? await loadShareCard(id) : null;
  if (!card) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const square = req.nextUrl.searchParams.get("size") === "square";
  const W = square ? 1080 : 1200;
  const H = square ? 1080 : 630;
  const len = card.comment.length;
  const size = square ? (len > 180 ? 44 : len > 90 ? 54 : 64) : len > 180 ? 34 : len > 90 ? 42 : 52;
  // Satori reads PNG/JPEG; a WebP logo is simply left out.
  const logo = card.logo && !card.logo.endsWith(".webp") ? card.logo : null;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: card.color, padding: square ? 64 : 48, fontFamily: "sans-serif" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#ffffff", borderRadius: 36, padding: square ? 72 : 56, boxShadow: "0 30px 60px rgba(15,23,42,0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {card.stars !== null ? (
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <svg key={i} width={square ? 52 : 42} height={square ? 52 : 42} viewBox="0 0 24 24">
                    <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill={i <= card.stars! ? "#f59e0b" : "#e2e8f0"} />
                  </svg>
                ))}
              </div>
            ) : (
              card.label && <div style={{ display: "flex", background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "10px 24px", fontSize: square ? 32 : 26, fontWeight: 700 }}>{card.label}</div>
            )}
          </div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: size, lineHeight: 1.3, color: "#0f172a", fontWeight: 600, marginTop: 24 }}>
            {`“${card.comment}”`}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: square ? 34 : 28, fontWeight: 700, color: "#0f172a" }}>{card.name}</div>
              <div style={{ fontSize: square ? 26 : 22, color: "#64748b" }}>about {card.businessName}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={logo} alt="" height={square ? 90 : 72} style={{ maxWidth: square ? 260 : 220, objectFit: "contain" }} />}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: square ? 28 : 18, color: "rgba(255,255,255,0.92)", fontSize: square ? 26 : 20 }}>
          Collected with TapTruly · taptruly.com
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, max-age=300, s-maxage=300", "X-Robots-Tag": "noindex" } },
  );
}
