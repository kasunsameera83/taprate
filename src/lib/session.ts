import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { ACCOUNT_COOKIE, listMemberships, mfaState, type Membership } from "@/lib/account";

/**
 * For server-rendered pages: returns the signed-in user and active account, or redirects.
 * Same checks as the API wrapper (verified session, 2FA step, real membership).
 */
export async function requirePageSession(opts: { needAccount: boolean }) {
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const mfa = await mfaState(supabase);
  if (mfa.needsCode) redirect("/login/verify");

  const all = await listMemberships(supabase, data.user.id);
  const wanted = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  const active: Membership | null = all.find((m) => m.accountId === wanted) ?? all[0] ?? null;
  if (opts.needAccount && !active) redirect("/welcome");

  return { supabase, user: data.user, memberships: all, active, mfaEnabled: mfa.enabled };
}
