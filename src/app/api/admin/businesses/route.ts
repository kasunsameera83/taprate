import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { assertPlatformAdmin } from "@/lib/admin";
import { adminBusinessesQuerySchema } from "@/lib/validation/admin";

const PAGE = 25;

export const GET = secureRoute<undefined, z.infer<typeof adminBusinessesQuerySchema>, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: adminBusinessesQuerySchema },
  async ({ supabase, query }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.rpc("admin_list_accounts", { p_search: query.search ?? "", p_limit: PAGE, p_offset: (query.page - 1) * PAGE });
    if (error) throw dbError(error);
    const rows = (data ?? []) as Array<{ id: string; name: string; plan: string; credits: number; created_at: string; suspended: boolean; owner_email: string | null; members: number; responses_30d: number; total: number }>;
    return ok({
      page: query.page,
      pageSize: PAGE,
      total: Number(rows[0]?.total ?? 0),
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        plan: r.plan,
        credits: r.credits,
        createdAt: r.created_at,
        suspended: r.suspended,
        ownerEmail: r.owner_email,
        members: Number(r.members),
        responses30d: Number(r.responses_30d),
      })),
    });
  },
);
