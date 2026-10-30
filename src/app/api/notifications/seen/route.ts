import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";

// "Mark all as read": the signed-in person's own seen-time for the active business (the database checks it).
export const POST = secureRoute(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite },
  async ({ supabase, membership }) => {
    const { error } = await supabase.rpc("mark_notifications_seen", { p_account: membership.accountId });
    if (error) throw dbError(error);
    return ok({ seen: true });
  },
);
