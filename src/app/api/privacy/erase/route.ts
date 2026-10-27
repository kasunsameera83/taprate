import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { eraseCustomerSchema } from "@/lib/validation/schemas";
import { sha256Hex } from "@/lib/security/request";
import { audit } from "@/lib/audit";

// Right to erasure: delete every rating and comment linked to one customer's email.
export const POST = secureRoute<undefined, undefined, z.infer<typeof eraseCustomerSchema>>(
  { auth: "user", action: "privacy:erase", ipLimit: LIMITS.userWrite, userLimit: LIMITS.dangerous, body: eraseCustomerSchema, maxBodyBytes: 1024 },
  async ({ supabase, membership, user, body, ipHash }) => {
    const { data, error } = await supabase.rpc("erase_customer_data", { p_account: membership.accountId, p_email: body.email });
    if (error) throw dbError(error);
    // The log keeps only a hash of the email, so the erased address isn't stored again.
    await audit({
      accountId: membership.accountId,
      userId: user.id,
      action: "privacy.customer_erased",
      metadata: { emailHash: sha256Hex(body.email), deleted: data as number },
      ipHash,
    });
    return ok({ deleted: data as number });
  },
);
