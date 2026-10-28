import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";

// Daily housekeeping (old rate-limit rows, unconfirmed clicks, abandoned checkouts, old logs).
// Needs "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";

function authorized(req: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.cron, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) return NextResponse.json({ ok: false }, { status: 429 });
  if (!e.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(req, e.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = adminClient();
  const { data, error } = await db.rpc("maintenance_cleanup");
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  const { data: sending } = await db.rpc("sending_cleanup");
  return NextResponse.json({ ok: true, removed: data, sending: sending ?? null });
}
