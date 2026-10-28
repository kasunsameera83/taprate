import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { promoCodeSchema, type PromoCodeInput } from "@/lib/validation/schemas";
import { promoColumns } from "@/lib/billing/promoColumns";

export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase }) => {
    await assertPlatformAdmin(supabase);
    const [{ data, error }, { data: stats, error: sErr }] = await Promise.all([
      supabase
        .from("promo_codes")
        .select("id, code, description, kind, percent_off, amount_off_lkr, amount_off_usd, bonus_credits, applies_to, max_uses, starts_at, ends_at, enabled, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.rpc("admin_promo_stats"),
    ]);
    if (error) throw dbError(error);
    if (sErr) throw dbError(sErr);
    const byId = new Map(((stats ?? []) as Array<{ promo_id: string; uses: number; revenue: Record<string, number> }>).map((s) => [s.promo_id, s]));
    return ok(
      (data ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        description: p.description,
        kind: p.kind,
        percentOff: p.percent_off,
        amountOffLkr: p.amount_off_lkr === null ? null : Number(p.amount_off_lkr),
        amountOffUsd: p.amount_off_usd === null ? null : Number(p.amount_off_usd),
        bonusCredits: p.bonus_credits,
        appliesTo: p.applies_to,
        maxUses: p.max_uses,
        startsAt: p.starts_at,
        endsAt: p.ends_at,
        enabled: p.enabled,
        uses: Number(byId.get(p.id)?.uses ?? 0),
        revenue: byId.get(p.id)?.revenue ?? {},
      })),
    );
  },
);

export const POST = secureRoute<undefined, undefined, PromoCodeInput, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: promoCodeSchema, maxBodyBytes: 2048 },
  async ({ supabase, user, body, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase
      .from("promo_codes")
      .insert({ code: body.code, kind: body.kind, created_by: user.id, ...promoColumns(body) })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return fail("conflict", "That code already exists.", { code: "That code already exists." }, requestId);
      throw dbError(error);
    }
    await adminAudit({ adminId: user.id, action: "promo.created", targetType: "promo", targetId: body.code, metadata: { kind: body.kind }, ipHash });
    return ok({ id: data.id }, 201);
  },
);
