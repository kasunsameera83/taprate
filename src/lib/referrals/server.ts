import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

export const REFERRAL_CODE = /^[A-Z2-9]{8}$/;

/** After a payment is granted: bonus for both businesses if this one joined through a referral. Never throws. */
export async function rewardReferral(accountId: string): Promise<void> {
  try {
    const { data, error } = await adminClient().rpc("reward_referral", { p_account: accountId });
    if (error) console.error("[referral] reward failed", { code: error.code });
    else if (data === true) await audit({ accountId, userId: null, action: "referral.rewarded", targetType: "account", targetId: accountId });
  } catch {
    console.error("[referral] reward failed");
  }
}

/** Right after sign-up. The database checks the code and refuses self-referrals. Never throws. */
export async function attachReferral(userId: string, code: string | undefined): Promise<void> {
  if (!code || !REFERRAL_CODE.test(code)) return;
  try {
    const { error } = await adminClient().rpc("attach_referral", { p_user: userId, p_code: code });
    if (error) console.error("[referral] attach failed", { code: error.code });
  } catch {
    console.error("[referral] attach failed");
  }
}
