import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";

const params = z.object({ id: uuidSchema }).strict();

// Status of one order, for the "processing your payment" page. Owner only (RLS too).
export const GET = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params },
  async ({ supabase, membership, params, requestId }) => {
    const { data, error } = await supabase.from("billing_orders").select("id, kind, item, status, credits").eq("id", params.id).eq("account_id", membership.accountId).maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    return ok({ id: data.id, kind: data.kind, item: data.item, status: data.status, credits: data.credits });
  },
);
