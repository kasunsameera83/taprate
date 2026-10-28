import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { encryptPayload, isPushEndpoint, vapidAuthorization, vapidKey } from "@/lib/push/webpush";

export type PushMessage = { title: string; body: string; url: string; tag?: string };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

export function pushConfigured(): boolean {
  const e = env();
  return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

/** Sends one message to one device. Gone devices (404/410) are removed. Never throws. */
async function sendOne(db: SupabaseClient, sub: Sub, msg: PushMessage): Promise<boolean> {
  const e = env();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY || !isPushEndpoint(sub.endpoint)) return false;
  try {
    const body = encryptPayload(Buffer.from(JSON.stringify({ ...msg, url: msg.url.startsWith("/") ? msg.url : "/app" })), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(sub.endpoint, e.VAPID_SUBJECT || `mailto:${e.ALERT_FROM_EMAIL || "alerts@example.com"}`, e.VAPID_PUBLIC_KEY, vapidKey(e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY)),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body: new Uint8Array(body),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404 || res.status === 410) {
      await db.from("push_subscriptions").delete().eq("id", sub.id);
      return false;
    }
    if (res.ok) await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
    return res.ok;
  } catch {
    return false;
  }
}

/** Sends to every device of these people for this business. Lock screens show it, so keep text free of customer details. */
export async function pushToUsers(db: SupabaseClient, accountId: string, userIds: string[], msg: PushMessage): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("account_id", accountId).in("user_id", userIds).limit(200);
  const results = await Promise.all(((data ?? []) as Sub[]).map((s) => sendOne(db, s, msg)));
  return results.filter(Boolean).length;
}

/** Owners and admins of a business, plus the agent a rating was for. */
export async function alertRecipients(db: SupabaseClient, accountId: string, agent: string | null): Promise<string[]> {
  const { data } = await db.from("memberships").select("user_id, role, agent_name").eq("account_id", accountId);
  return (data ?? []).filter((m) => m.role === "owner" || m.role === "admin" || (agent && m.role === "agent" && m.agent_name === agent)).map((m) => m.user_id as string);
}
