import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { verifySvixSignature } from "@/lib/security/svix";

// Delivery notices from Resend (server-to-server, signed with RESEND_WEBHOOK_SECRET in the Svix format,
// 5-minute replay window). A hard bounce or a spam complaint means we never email that address again,
// for any business: it protects everyone's delivery.
export const dynamic = "force-dynamic";
const MAX_BYTES = 256 * 1024;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;

export async function POST(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.webhookPerIp, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return json({ ok: false }, 429);
  if (!e.RESEND_WEBHOOK_SECRET) return json({ ok: false, error: "not configured" }, 503);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return json({ ok: false }, 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return json({ ok: false }, 413);
  const ok = verifySvixSignature(
    e.RESEND_WEBHOOK_SECRET,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    raw,
  );
  if (!ok) {
    console.warn("[resend] rejected webhook (bad signature)");
    return json({ ok: false }, 400);
  }

  let event: { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }
  const type = typeof event.type === "string" ? event.type : "";
  // Only permanent bounces; a full mailbox ("Transient") may work next time.
  const reason = type === "email.complained" ? "complained" : type === "email.bounced" && event.data?.bounce?.type !== "Transient" ? "bounced" : null;
  if (!reason) return json({ ok: true, ignored: true });

  const to = Array.isArray(event.data?.to) ? event.data.to : [event.data?.to];
  const emails = to.filter((x): x is string => typeof x === "string" && x.length <= 254 && EMAIL.test(x.trim())).slice(0, 50);
  for (const addr of emails) {
    const { error } = await adminClient().rpc("suppress_globally", { p_email: addr.trim().toLowerCase(), p_reason: reason });
    if (error) return json({ ok: false }, 500); // Resend retries later
  }
  return json({ ok: true, suppressed: emails.length });
}
