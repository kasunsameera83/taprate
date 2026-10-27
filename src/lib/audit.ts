import "server-only";
import { adminClient } from "@/lib/supabase/server";

export type AuditEntry = {
  accountId: string | null;
  userId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  ipHash?: string | null;
};

/** Append-only audit trail. Users can read it (owners/admins) but never write or edit it. */
export async function audit(entry: AuditEntry): Promise<void> {
  const { error } = await adminClient().from("audit_log").insert({
    account_id: entry.accountId,
    user_id: entry.userId,
    action: entry.action.slice(0, 60),
    target_type: entry.targetType?.slice(0, 40) ?? null,
    target_id: entry.targetId?.slice(0, 80) ?? null,
    metadata: entry.metadata ?? {},
    ip_hash: entry.ipHash ?? null,
  });
  if (error) console.error("[audit] failed to write audit entry", { action: entry.action, code: error.code });
}
