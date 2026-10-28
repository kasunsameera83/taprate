import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { featureSchema, uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Show (or stop showing) a happy customer's comment on the website testimonial wall. Only comments the
// customer agreed to share can be shown; the database checks that and the role.
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof featureSchema>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: featureSchema, maxBodyBytes: 128 },
  async ({ supabase, membership, user, params, body, ipHash }) => {
    const { error } = await supabase.rpc("feature_response", { p_response: params.id, p_featured: body.featured });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: body.featured ? "testimonial.shown" : "testimonial.hidden", targetType: "response", targetId: params.id, ipHash });
    return ok({ featured: body.featured });
  },
);
