import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { listMemberships } from "@/lib/account";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

// One view over every business this person helps run (agencies, groups, franchise owners).
// Read with the user's own session: each count is checked by the database against their membership.
// Agents only see their own business inside it, so those memberships are left out.
export const GET = secureRoute(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, user, membership }) => {
    const all = (await listMemberships(supabase, user.id)).filter((m) => m.role !== "agent").slice(0, 50);
    const ids = all.map((m) => m.accountId);
    if (!ids.length) return ok({ currentId: membership.accountId, businesses: [] });

    const { data: accts, error } = await supabase.from("accounts").select("id, name, plan, credit_balance").in("id", ids);
    if (error) throw dbError(error);
    const byId = new Map((accts ?? []).map((a) => [a.id as string, a]));
    const since = new Date(Date.now() - 30 * DAY).toISOString();

    const count = async (accountId: string, build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
      const { count: n, error: e } = await build(base(accountId));
      if (e) throw dbError(e);
      return n ?? 0;
    };
    const base = (accountId: string) => supabase.from("responses").select("id", { count: "exact", head: true }).eq("account_id", accountId);

    const rows = [];
    // Ten businesses at a time keeps this quick without flooding the database.
    for (let i = 0; i < all.length; i += 10) {
      rows.push(
        ...(await Promise.all(
          all.slice(i, i + 10).map(async (m) => {
            const [total, positive, negative, open] = await Promise.all([
              count(m.accountId, (q) => q.eq("status", "confirmed").gte("created_at", since)),
              count(m.accountId, (q) => q.eq("status", "confirmed").eq("sentiment", "positive").gte("created_at", since)),
              count(m.accountId, (q) => q.eq("status", "confirmed").eq("sentiment", "negative").gte("created_at", since)),
              count(m.accountId, (q) => q.in("followup_status", ["open", "in_progress"])),
            ]);
            const a = byId.get(m.accountId);
            return {
              id: m.accountId,
              name: a?.name ?? m.accountName,
              role: m.role,
              plan: a?.plan ?? null,
              credits: a?.credit_balance ?? null,
              responses30d: total,
              satisfaction: total ? Math.round((positive / total) * 100) : null,
              negative30d: negative,
              openFollowups: open,
            };
          }),
        )),
      );
    }
    return ok({ currentId: membership.accountId, businesses: rows });
  },
);
