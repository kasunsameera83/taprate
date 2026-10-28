import "server-only";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePageSession } from "@/lib/session";
import { adminClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/security/route";

// Platform admin (the product owner). Being listed in platform_admins is not enough: every check also
// needs a two-step-verified session, and the database repeats the same check in every admin function
// and table policy. Non-admins get a plain 404 so the area isn't even revealed.

export async function requirePlatformAdminPage(): Promise<{ status: "ok" | "needs_mfa"; email: string }> {
  const { supabase, user } = await requirePageSession({ needAccount: false });
  const { data } = await supabase.rpc("platform_admin_status");
  if (data !== "ok" && data !== "needs_mfa") notFound();
  return { status: data, email: user.email ?? "" };
}

export async function assertPlatformAdmin(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new ApiError("not_found");
}

export async function adminAudit(entry: { adminId: string; action: string; targetType?: string; targetId?: string; metadata?: Record<string, string | number | boolean | null>; ipHash?: string }): Promise<void> {
  const { error } = await adminClient().from("platform_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action.slice(0, 60),
    target_type: entry.targetType?.slice(0, 40) ?? null,
    target_id: entry.targetId?.slice(0, 80) ?? null,
    metadata: entry.metadata ?? {},
    ip_hash: entry.ipHash ?? null,
  });
  if (error) console.error("[admin-audit] failed", { action: entry.action, code: error.code });
}
