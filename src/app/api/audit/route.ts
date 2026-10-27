import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { auditQuerySchema } from "@/lib/validation/schemas";

const PAGE = 50;

// Activity log for owners and admins (RLS enforces the same).
export const GET = secureRoute<undefined, z.infer<typeof auditQuerySchema>>(
  { auth: "user", action: "audit:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: auditQuerySchema },
  async ({ supabase, membership, query }) => {
    const from = (query.page - 1) * PAGE;
    const [log, members] = await Promise.all([
      supabase
        .from("audit_log")
        .select("id, user_id, action, target_type, metadata, created_at", { count: "exact" })
        .eq("account_id", membership.accountId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1),
      supabase.rpc("account_members", { p_account: membership.accountId }),
    ]);
    if (log.error) throw dbError(log.error);
    if (members.error) throw dbError(members.error);

    const emails = new Map((members.data as Array<{ user_id: string; email: string }>).map((m) => [m.user_id, m.email]));
    return ok({
      page: query.page,
      total: log.count ?? 0,
      pageSize: PAGE,
      items: (log.data ?? []).map((e) => ({
        id: String(e.id),
        actor: e.user_id ? (emails.get(e.user_id as string) ?? "Former member") : "System",
        action: e.action as string,
        targetType: (e.target_type as string | null) ?? null,
        // Only simple, non-sensitive metadata is ever written to the log.
        metadata: (e.metadata ?? {}) as Record<string, string | number | boolean | null>,
        createdAt: e.created_at as string,
      })),
    });
  },
);
