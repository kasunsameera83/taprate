import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { catalogItemSchema, type CatalogItemInput } from "@/lib/site/content";

export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase }) => {
    await assertPlatformAdmin(supabase);
    return ok(await loadCatalog());
  },
);

// Change one plan or pack. New prices apply to NEW purchases only; existing subscriptions keep theirs.
export const PUT = secureRoute<undefined, undefined, CatalogItemInput, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: catalogItemSchema, maxBodyBytes: 2048 },
  async ({ supabase, user, body, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const update =
      body.kind === "plan"
        ? { name: body.name, blurb: body.blurb, responses: body.responses, lkr_month: body.lkrMonth, lkr_year: body.lkrYear, usd_month: body.usdMonth, usd_year: body.usdYear, active: body.active, updated_at: new Date().toISOString() }
        : { name: body.name, responses: body.responses, lkr_price: body.lkrPrice, usd_price: body.usdPrice, active: body.active, updated_at: new Date().toISOString() };
    // RLS + column grants: only platform admins, only these columns, never the item id.
    const { data, error } = await supabase.from("billing_catalog").update(update).eq("item", body.item).eq("kind", body.kind).select("item").maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    const metadata: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(body)) if (k !== "item" && k !== "kind" && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) metadata[k] = v;
    await adminAudit({ adminId: user.id, action: "pricing.updated", targetType: "catalog", targetId: body.item, metadata, ipHash });
    return ok({ saved: true });
  },
);
