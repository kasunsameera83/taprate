import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { hitRateLimit } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";

// For uptime monitoring (e.g. UptimeRobot every 5 minutes). Says only "up" or "down" plus which part is
// failing; no versions, keys or data.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  let config = true;
  try {
    const e = env();
    if (!(await hitRateLimit({ name: "health:ip", limit: 30, windowSec: 60 }, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers });
    }
  } catch {
    config = false;
  }
  let db = false;
  if (config) {
    try {
      const { error } = await adminClient().from("billing_catalog").select("item", { head: true, count: "exact" }).limit(1);
      db = !error;
    } catch {
      db = false;
    }
  }
  const okAll = config && db;
  return NextResponse.json({ ok: okAll, checks: { config, database: db }, time: new Date().toISOString() }, { status: okAll ? 200 : 503, headers });
}
