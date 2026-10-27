import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";

// Pending invites for the signed-in user's confirmed email address.
export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase }) => {
    const { data, error } = await supabase.rpc("my_invites");
    if (error) throw dbError(error);
    return ok(
      (data as Array<{ id: string; account_name: string; role: string; agent_name: string | null; invited_at: string; expires_at: string }>).map((i) => ({
        id: i.id,
        accountName: i.account_name,
        role: i.role,
        agentName: i.agent_name,
        invitedAt: i.invited_at,
        expiresAt: i.expires_at,
      })),
    );
  },
);
