import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { DEFAULT_LANDING, landingOrDefault, landingSchema, type Landing } from "@/lib/site/content";

// Landing page content: the draft (being edited) and whether it differs from what's live.
export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.from("site_content").select("draft, published, updated_at, published_at").eq("key", "landing").maybeSingle();
    if (error) throw dbError(error);
    const draft = data ? landingOrDefault(data.draft) : DEFAULT_LANDING;
    return ok({
      draft,
      hasUnpublished: !data || JSON.stringify(data.draft) !== JSON.stringify(data.published),
      updatedAt: data?.updated_at ?? null,
      publishedAt: data?.published_at ?? null,
    });
  },
);

// Save the draft. Visitors don't see it until it's published.
export const PUT = secureRoute<undefined, undefined, Landing, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: landingSchema, maxBodyBytes: 64 * 1024 },
  async ({ supabase, user, body, ipHash }) => {
    await assertPlatformAdmin(supabase);
    // RLS: only platform admins (with 2FA) can write this table.
    const { error } = await supabase.from("site_content").upsert({ key: "landing", draft: body, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "key" });
    if (error) throw dbError(error);
    await adminAudit({ adminId: user.id, action: "landing.draft_saved", targetType: "site_content", targetId: "landing", ipHash });
    return ok({ saved: true });
  },
);
