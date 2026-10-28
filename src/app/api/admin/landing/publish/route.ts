import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { landingSchema } from "@/lib/site/content";

// Publish the saved draft: it goes live on the landing page straight away.
export const POST = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite },
  async ({ supabase, user, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.from("site_content").select("draft").eq("key", "landing").maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("conflict", "Save a draft first.", undefined, requestId);
    const check = landingSchema.safeParse(data.draft);
    if (!check.success) return fail("validation_failed", "The draft has problems. Open it, fix them and save again.", undefined, requestId);
    const { error: upErr } = await supabase.from("site_content").update({ published: check.data, published_at: new Date().toISOString(), updated_by: user.id }).eq("key", "landing");
    if (upErr) throw dbError(upErr);
    await adminAudit({ adminId: user.id, action: "landing.published", targetType: "site_content", targetId: "landing", ipHash });
    return ok({ published: true });
  },
);
