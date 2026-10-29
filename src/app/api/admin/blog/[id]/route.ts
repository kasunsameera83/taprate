import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { uuidSchema } from "@/lib/validation/schemas";
import { blogPostSchema, type BlogPostInput } from "@/lib/blog/schema";
import { ADMIN_POST_COLUMNS, toAdminPost, toColumns } from "@/lib/blog/admin";
import { isCoverPath } from "@/lib/blog/server";
import { adminClient } from "@/lib/supabase/server";

const params = z.object({ id: uuidSchema }).strict();

export const GET = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params },
  async ({ supabase, params, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.from("blog_posts").select(ADMIN_POST_COLUMNS).eq("id", params.id).maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    return ok(toAdminPost(data as Parameters<typeof toAdminPost>[0]));
  },
);

export const PUT = secureRoute<z.infer<typeof params>, undefined, BlogPostInput, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: blogPostSchema, maxBodyBytes: 256 * 1024 },
  async ({ supabase, user, params, body, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.from("blog_posts").update(toColumns(body)).eq("id", params.id).select("id").maybeSingle();
    if (error?.code === "23505") return fail("validation_failed", undefined, { slug: "Another post already uses this web address" }, requestId);
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    await adminAudit({ adminId: user.id, action: body.status === "published" ? "blog.published" : "blog.saved", targetType: "blog_post", targetId: params.id, ipHash });
    return ok({ saved: true });
  },
);

export const DELETE = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, user, params, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.from("blog_posts").delete().eq("id", params.id).select("id, cover_path").maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found", undefined, undefined, requestId);
    // Its cover picture goes too (only a path inside this post's own folder).
    if (isCoverPath(data.cover_path, params.id)) await adminClient().storage.from("blog-images").remove([data.cover_path]);
    await adminAudit({ adminId: user.id, action: "blog.deleted", targetType: "blog_post", targetId: params.id, ipHash });
    return ok({ deleted: true });
  },
);
