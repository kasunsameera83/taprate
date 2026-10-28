import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { promotionSchema, type PromotionInput } from "@/lib/site/content";

export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase
      .from("site_promotions")
      .select("id, kind, name, title, body, cta_label, cta_url, theme, starts_at, ends_at, enabled, updated_at")
      .order("starts_at", { ascending: false })
      .limit(100);
    if (error) throw dbError(error);
    return ok(
      (data ?? []).map((p) => ({
        id: p.id,
        kind: p.kind,
        name: p.name,
        title: p.title,
        body: p.body,
        ctaLabel: p.cta_label,
        ctaUrl: p.cta_url,
        theme: p.theme,
        startsAt: p.starts_at,
        endsAt: p.ends_at,
        enabled: p.enabled,
      })),
    );
  },
);

export const POST = secureRoute<undefined, undefined, PromotionInput, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: promotionSchema, maxBodyBytes: 4096 },
  async ({ supabase, user, body, ipHash }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase
      .from("site_promotions")
      .insert({
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
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw dbError(error);
    await adminAudit({ adminId: user.id, action: "promotion.created", targetType: "promotion", targetId: data.id, metadata: { kind: body.kind }, ipHash });
    return ok({ id: data.id }, 201);
  },
);
