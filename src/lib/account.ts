import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRole, type Role } from "@/lib/security/authz";
import { isUuid } from "@/lib/security/signing";

/** Cookie holding the account the user last switched to. A hint only: always checked against memberships. */
export const ACCOUNT_COOKIE = "tr_account";

export type Membership = { accountId: string; accountName: string; role: Role; agentName: string | null };

/** All accounts this user belongs to (read as the user, through Row Level Security). */
export async function listMemberships(supabase: SupabaseClient, userId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("account_id, role, agent_name, created_at, accounts(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw error;
  const out: Membership[] = [];
  for (const m of (data ?? []) as unknown as Array<{ account_id: string; role: string; agent_name: string | null; accounts: { name: string } | null }>) {
    if (!isRole(m.role)) continue;
    out.push({ accountId: m.account_id, accountName: m.accounts?.name ?? "Business", role: m.role, agentName: m.agent_name });
  }
  return out;
}

export async function resolveMembership(supabase: SupabaseClient, userId: string, cookieAccountId?: string | null): Promise<Membership | null> {
  const all = await listMemberships(supabase, userId);
  if (cookieAccountId && isUuid(cookieAccountId)) {
    const chosen = all.find((m) => m.accountId === cookieAccountId);
    if (chosen) return chosen;
  }
  return all[0] ?? null;
}

/**
 * Two-factor state of the current session. "needsCode" = the user has a verified authenticator but this
 * session hasn't completed the second step. Fails closed: if Supabase can't tell us, we ask for the code.
 */
export async function mfaState(supabase: SupabaseClient): Promise<{ needsCode: boolean; enabled: boolean }> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) {
    console.error("[mfa] could not read assurance level", { code: error?.code });
    return { needsCode: true, enabled: true };
  }
  return { needsCode: data.nextLevel === "aal2" && data.currentLevel !== "aal2", enabled: data.nextLevel === "aal2" };
}

export const accountCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
