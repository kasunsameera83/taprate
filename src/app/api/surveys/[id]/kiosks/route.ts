import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { kioskCreateSchema, uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";
import { publicOriginFor } from "@/lib/surveyDomains";

const params = z.object({ id: uuidSchema }).strict();

// Create a kiosk link for this survey. The secret is generated here, shown ONCE, and only its hash is stored.
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof kioskCreateSchema>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: kioskCreateSchema, maxBodyBytes: 512 },
  async ({ supabase, membership, user, params, body, ipHash }) => {
    const secret = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(secret).digest("hex");
    // The database checks the role and that the survey belongs to this account.
    const { data, error } = await supabase.rpc("create_kiosk", {
      p_account: membership.accountId,
      p_survey: params.id,
      p_name: body.name,
      p_token_hash: tokenHash,
      p_location: body.locationId ?? null,
    });
    if (error) throw dbError(error);
    const kioskId = data as string;
    await audit({ accountId: membership.accountId, userId: user.id, action: "kiosk.created", targetType: "kiosk", targetId: kioskId, ipHash });
    return ok({ id: kioskId, url: `${await publicOriginFor(membership.accountId)}/k/${kioskId}.${secret}` }, 201);
  },
);
