import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { processQueue, sendReminders } from "@/lib/sending/server";

// Daily: finishes any survey emails left in the queue (e.g. the page was closed mid-send) and sends the
// one reminder to people who haven't rated yet. Needs "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const queue = await processQueue(db, { sendId: null, budgetMs: 180_000 });
  const reminders = await sendReminders(db, 500);
  return NextResponse.json({ ok: true, sent: queue.sent, failed: queue.failed, reminded: reminders.reminded });
}
