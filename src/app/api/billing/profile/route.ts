import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { billingProfileSchema, type BillingProfileInput } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

// Billing details (needed by PayHere, printed on receipts). Owner only; written by the server after
// that check (users can't write billing tables directly).
export const PUT = secureRoute<undefined, undefined, BillingProfileInput>(
  { auth: "user", action: "billing:manage", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: billingProfileSchema, maxBodyBytes: 4096 },
  async ({ membership, user, body, ipHash }) => {
    const { error } = await adminClient()
      .from("billing_profiles")
      .upsert(
        {
          account_id: membership.accountId,
          first_name: body.firstName,
          last_name: body.lastName,
          email: body.email,
          phone: body.phone,
          address: body.address,
          city: body.city,
          country: body.country,
          company: body.company ?? null,
          tax_id: body.taxId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" },
      );
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "billing.profile_updated", ipHash });
    return ok({ saved: true });
  },
);
