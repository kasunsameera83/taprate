import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { getClientIp, hashIp } from "@/lib/security/request";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/security/html";

// Daily reminder for overdue follow-ups. Called by a scheduler (Vercel Cron) with
// "Authorization: Bearer <CRON_SECRET>". Not reachable without the secret; each follow-up is
// reminded at most once a day.
export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

function authorized(req: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  const e = env();
  if (!(await hitRateLimit(LIMITS.cron, hashIp(e.IP_HASH_SALT, getClientIp(req.headers))))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  if (!e.CRON_SECRET) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(req, e.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });

  const db = adminClient();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("responses")
    .select("id, account_id, assignee, due_at, agent, respondent_email, accounts(name)")
    .in("followup_status", ["open", "in_progress"])
    .lt("due_at", now.toISOString())
    .or(`reminded_at.is.null,reminded_at.lt.${dayAgo}`)
    .limit(MAX_ITEMS);
  if (error) {
    console.error("[cron] query failed", { code: error.code });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  type Item = { id: string; account_id: string; assignee: string | null; accounts: { name: string } | null };
  const items = (data ?? []) as unknown as Item[];

  // Recipient: the assignee, or the account's owners and admins when nobody is assigned.
  const recipients = new Map<string, { account: string; ids: string[] }>(); // key: userId|accountId
  const managers = new Map<string, string[]>();
  for (const it of items) {
    let users: string[];
    if (it.assignee) users = [it.assignee];
    else {
      if (!managers.has(it.account_id)) {
        const { data: m } = await db.from("memberships").select("user_id").eq("account_id", it.account_id).in("role", ["owner", "admin"]);
        managers.set(it.account_id, (m ?? []).map((x) => x.user_id as string));
      }
      users = managers.get(it.account_id)!;
    }
    for (const u of users) {
      const key = `${u}|${it.account_id}`;
      const entry = recipients.get(key) ?? { account: it.accounts?.name ?? "your business", ids: [] };
      entry.ids.push(it.id);
      recipients.set(key, entry);
    }
  }

  let sent = 0;
  for (const [key, entry] of recipients) {
    const userId = key.split("|")[0]!;
    const { data: u } = await db.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    if (!email) continue;
    const n = entry.ids.length;
    const result = await sendEmail({
      to: email,
      subject: `${n} overdue follow-up${n === 1 ? "" : "s"} for ${entry.account}`,
      html: `<p>${n} unhappy customer${n === 1 ? " is" : "s are"} still waiting for a follow-up at <strong>${escapeHtml(entry.account)}</strong>.</p>
             <p><a href="${escapeHtml(e.appOrigin)}/app/follow-ups?status=overdue">Open follow-ups</a></p>`,
    });
    if (result === "sent") sent++;
  }

  if (items.length) {
    await db.from("responses").update({ reminded_at: now.toISOString() }).in("id", items.map((i) => i.id));
  }
  return NextResponse.json({ ok: true, overdue: items.length, emailsSent: sent }, { headers: { "Cache-Control": "no-store" } });
}
