import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { isIconSetId, sentimentOf } from "@/lib/surveys/iconSets";
import { buildDropEmail, detectDrops, type DropRow } from "@/lib/insights/drops";
import { alertRecipients, pushToUsers } from "@/lib/push/server";

/** Daily: email owners and admins (and their phones) when satisfaction drops sharply. At most once a week per scope. */
export async function runDropAlerts(db: SupabaseClient, now = Date.now()): Promise<{ alerted: number }> {
  const e = env();
  const { data: accounts } = await db.from("accounts").select("id, name").eq("drop_alerts_enabled", true).is("suspended_at", null).limit(2000);
  let alerted = 0;
  const since = new Date(now - 14 * 86_400_000).toISOString();
  for (const acct of accounts ?? []) {
    const [{ data: rows }, { data: locs }, { data: recent }] = await Promise.all([
      db.from("responses").select("rating, created_at, location_id, surveys(icon_set)").eq("account_id", acct.id).eq("status", "confirmed").neq("channel", "import").gte("created_at", since).limit(20000),
      db.from("locations").select("id, name").eq("account_id", acct.id).is("archived_at", null).limit(200),
      db.from("drop_alert_log").select("scope").eq("account_id", acct.id).gte("sent_at", new Date(now - 7 * 86_400_000).toISOString()),
    ]);
    const list: DropRow[] = ((rows ?? []) as unknown as Array<{ rating: number | null; created_at: string; location_id: string | null; surveys: { icon_set: string } | null }>)
      .filter((r) => r.rating !== null && r.surveys && isIconSetId(r.surveys.icon_set))
      .map((r) => ({ createdAt: r.created_at, locationId: r.location_id, positive: sentimentOf(r.surveys!.icon_set as never, r.rating!) === "positive" }));
    if (list.length < 40) continue;
    const already = new Set((recent ?? []).map((r) => r.scope as string));
    const drops = detectDrops(list, new Map((locs ?? []).map((l) => [l.id as string, l.name as string])), now).filter((d) => !already.has(d.scope));
    if (drops.length === 0) continue;

    const { data: members } = await db.from("memberships").select("user_id, role").eq("account_id", acct.id).in("role", ["owner", "admin"]);
    const mail = buildDropEmail(acct.name, drops, e.appOrigin);
    for (const m of members ?? []) {
      const { data: u } = await db.auth.admin.getUserById(m.user_id as string);
      if (u?.user?.email) await sendEmail({ to: u.user.email, subject: mail.subject, html: mail.html, text: mail.text });
    }
    const users = await alertRecipients(db, acct.id, null);
    await pushToUsers(db, acct.id, users, { title: "Satisfaction dropped", body: mail.subject, url: "/app", tag: "drop" });
    await db.from("drop_alert_log").insert(drops.map((d) => ({ account_id: acct.id, scope: d.scope, current_pct: d.currentPct, previous_pct: d.previousPct })));
    alerted++;
  }
  return { alerted };
}
