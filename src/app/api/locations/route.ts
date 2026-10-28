import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { locationCreateSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

// The business's branches. Everyone on the team can see the list (for filters); owners and admins change it.
export const GET = secureRoute(
  { auth: "user", action: "survey:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, archived_at, created_at")
      .eq("account_id", membership.accountId)
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw dbError(error);
    return ok((data ?? []).map((l) => ({ id: l.id, name: l.name, archived: l.archived_at !== null, createdAt: l.created_at })));
  },
);

export const POST = secureRoute<undefined, undefined, z.infer<typeof locationCreateSchema>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: locationCreateSchema, maxBodyBytes: 512 },
  async ({ supabase, membership, user, body, ipHash }) => {
    const { data, error } = await supabase.rpc("create_location", { p_account: membership.accountId, p_name: body.name });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "location.created", targetType: "location", targetId: String(data), ipHash });
    return ok({ id: data as string }, 201);
  },
);
