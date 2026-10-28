import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { promoCodeSchema, uuidSchema, type PromoCodeInput } from "@/lib/validation/schemas";
import { promoColumns } from "@/lib/billing/promoColumns";

const params = z.object({ id: uuidSchema }).strict();

// Edit a code. The code text and its kind can't change (the database refuses too); create a new one instead.
export const PUT = secureRoute<z.infer<typeof params>, undefined, PromoCodeInput, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: promoCodeSchema, maxBodyBytes: 2048 },
  async ({ supabase, user, params, body, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data: current } = await supabase.from("promo_codes").select("code, kind").eq("id", params.id).maybeSingle();
    if (!current) return fail("not_found", undefined, undefined, requestId);
    if (current.code !== body.code || current.kind !== body.kind) return fail("validation_failed", "A code's text and type can't change. Create a new code instead.", undefined, requestId);
    const { error } = await supabase.from("promo_codes").update({ ...promoColumns(body), updated_at: new Date().toISOString() }).eq("id", params.id);
    if (error) throw dbError(error);
    await adminAudit({ adminId: user.id, action: "promo.updated", targetType: "promo", targetId: body.code, ipHash });
    return ok({ saved: true });
  },
);

// Delete only codes nobody has used; used codes can be switched off instead (receipts refer to them).
export const DELETE = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, user, params, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { count } = await supabase.from("promo_redemptions").select("id", { count: "exact", head: true }).eq("promo_id", params.id);
    if ((count ?? 0) > 0) return fail("conflict", "This code has been used, so it can't be deleted. Switch it off instead.", undefined, requestId);
    const { data, error } = await supabase.from("promo_codes").delete().eq("id", params.id).select("code").maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    await adminAudit({ adminId: user.id, action: "promo.deleted", targetType: "promo", targetId: data.code, ipHash });
    return ok({ deleted: true });
  },
);
