import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// The business's invite link and how many joined. Owners and admins (checked again in the database).
export const GET = secureRoute(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data: code, error } = await supabase.rpc("referral_code", { p_account: membership.accountId });
    if (error) throw dbError(error);
    const { data: rows, error: rErr } = await supabase
      .from("referrals")
      .select("rewarded_at")
      .eq("referrer_account", membership.accountId)
      .limit(1000);
    if (rErr) throw dbError(rErr);
    const list = rows ?? [];
    return ok({
      code: String(code),
      link: `${env().appOrigin}/signup?ref=${encodeURIComponent(String(code))}`,
      bonus: 250,
      joined: list.length,
      rewarded: list.filter((r) => r.rewarded_at).length,
    });
  },
);
