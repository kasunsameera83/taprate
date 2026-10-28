import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { uuidSchema } from "@/lib/validation/schemas";
import { promotionSchema, type PromotionInput } from "@/lib/site/content";

const params = z.object({ id: uuidSchema }).strict();

export const PUT = secureRoute<z.infer<typeof params>, undefined, PromotionInput, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: promotionSchema, maxBodyBytes: 4096 },
  async ({ supabase, user, params, body, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase
      .from("site_promotions")
      .update({
        kind: body.kind,
        name: body.name,
        title: body.title,
        body: body.body,
        cta_label: body.ctaLabel,
        cta_url: body.ctaUrl,
        theme: body.theme,
        starts_at: body.startsAt,
        ends_at: body.endsAt,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select("id")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    await adminAudit({ adminId: user.id, action: "promotion.updated", targetType: "promotion", targetId: params.id, ipHash });
    return ok({ saved: true });
  },
);

export const DELETE = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, user, params, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.from("site_promotions").delete().eq("id", params.id).select("id").maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    await adminAudit({ adminId: user.id, action: "promotion.deleted", targetType: "promotion", targetId: params.id, ipHash });
    return ok({ deleted: true });
  },
);
