import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";

// Team members (with emails) and pending invites. Owners and admins; the database checks again.
export const GET = secureRoute(
  { auth: "user", action: "team:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership, user }) => {
    const [members, invites] = await Promise.all([
      supabase.rpc("account_members", { p_account: membership.accountId }),
      supabase
        .from("invites")
        .select("id, email, role, agent_name, created_at, expires_at")
        .eq("account_id", membership.accountId)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);
    if (members.error) throw dbError(members.error);
    if (invites.error) throw dbError(invites.error);

    return ok({
      myRole: membership.role,
      myUserId: user.id,
      members: (members.data as Array<{ user_id: string; email: string; role: string; agent_name: string | null; joined_at: string }>).map((m) => ({
        userId: m.user_id,
        email: m.email,
        role: m.role,
        agentName: m.agent_name,
        joinedAt: m.joined_at,
      })),
      invites: (invites.data ?? []).map((i) => ({
        id: i.id as string,
        email: i.email as string,
        role: i.role as string,
        agentName: (i.agent_name as string | null) ?? null,
        createdAt: i.created_at as string,
        expiresAt: i.expires_at as string,
      })),
    });
  },
);
