import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { suppressionSchema } from "@/lib/validation/sending";
import { emailSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

// The business's do-not-email list: people who unsubscribed, plus addresses the team added.
export const GET = secureRoute(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data, error } = await supabase
      .from("email_suppressions")
      .select("email, reason, created_at")
      .eq("account_id", membership.accountId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw dbError(error);
    return ok({ items: (data ?? []).map((r) => ({ email: r.email, reason: r.reason, createdAt: r.created_at })) });
  },
);

export const POST = secureRoute<undefined, undefined, z.infer<typeof suppressionSchema>>(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: suppressionSchema, maxBodyBytes: 512 },
  async ({ supabase, membership, user, body, ipHash }) => {
    const { error } = await supabase.rpc("add_suppression", { p_account: membership.accountId, p_email: body.email });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "suppression.added", targetType: "email", ipHash });
    return ok({ added: true }, 201);
  },
);

const delQuery = z.object({ email: emailSchema }).strict();

// Only addresses the team added can be removed; a customer's own unsubscribe stays (the database enforces this).
export const DELETE = secureRoute<undefined, z.infer<typeof delQuery>>(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, query: delQuery },
  async ({ supabase, membership, user, query, ipHash }) => {
    const { data, error } = await supabase.rpc("remove_suppression", { p_account: membership.accountId, p_email: query.email });
    if (error) throw dbError(error);
    if (Number(data ?? 0) > 0) await audit({ accountId: membership.accountId, userId: user.id, action: "suppression.removed", targetType: "email", ipHash });
    return ok({ removed: Number(data ?? 0) > 0 });
  },
);
