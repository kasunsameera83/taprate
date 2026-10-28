import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";

// Daily: plans cancelled with PayHere (which just stops charging) end once the paid period is over.
// (Stripe tells us itself when a cancelled plan ends.) Needs "Authorization: Bearer <CRON_SECRET>".
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
  const cutoff = new Date().toISOString();
  const { data, error } = await db
    .from("subscriptions")
    .select("provider, provider_sub_id")
    .eq("provider", "payhere")
    .eq("status", "cancelled")
    .or(`current_period_end.is.null,current_period_end.lt.${cutoff}`)
    .limit(500);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  let ended = 0;
  for (const s of data ?? []) {
    const { error: uErr } = await db.rpc("billing_subscription_update", { p_provider: s.provider, p_sub_ref: s.provider_sub_id, p_status: "ended", p_cancel_at_period_end: null, p_period_end: null });
    if (!uErr) ended++;
  }
  return NextResponse.json({ ok: true, ended });
}
