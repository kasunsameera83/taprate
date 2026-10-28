import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { assertPlatformAdmin } from "@/lib/admin";
import { adminPageQuerySchema } from "@/lib/validation/admin";

const PAGE = 50;

export const GET = secureRoute<undefined, z.infer<typeof adminPageQuerySchema>, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, query: adminPageQuerySchema },
  async ({ supabase, query }) => {
    await assertPlatformAdmin(supabase);
    const from = (query.page - 1) * PAGE;
    const { data, error, count } = await supabase
      .from("platform_audit_log")
      .select("id, admin_id, action, target_type, target_id, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw dbError(error);
    return ok({ page: query.page, total: count ?? 0, pageSize: PAGE, items: data ?? [] });
  },
);
