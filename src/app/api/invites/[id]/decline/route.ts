import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";

const params = z.object({ id: uuidSchema }).strict();

export const POST = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, params }) => {
    const { error } = await supabase.rpc("decline_invite", { p_invite: params.id });
    if (error) throw dbError(error);
    return ok({ declined: true });
  },
);
