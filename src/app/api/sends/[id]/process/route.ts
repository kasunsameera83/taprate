import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { processQueue } from "@/lib/sending/server";

const params = z.object({ id: uuidSchema }).strict();

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Keep sending a big send while its page is open (the daily job finishes anything left over).
export const POST = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.sendProcess, params },
  async ({ supabase, membership, params }) => {
    // The user's own session proves this send belongs to their business before the service role touches it.
    const { data, error } = await supabase.from("survey_sends").select("id").eq("id", params.id).eq("account_id", membership.accountId).maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found");
    const r = await processQueue(adminClient(), { sendId: data.id, budgetMs: 40_000 });
    return ok(r);
  },
);
