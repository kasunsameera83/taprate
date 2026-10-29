import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { blogPostSchema, type BlogPostInput } from "@/lib/blog/schema";
import { ADMIN_POST_COLUMNS, toAdminPost, toColumns } from "@/lib/blog/admin";

// Blog posts for the owner's console. Read and written with the owner's own session: the database only
// allows platform admins who finished two-step sign-in.
export const GET = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase.from("blog_posts").select(ADMIN_POST_COLUMNS).order("created_at", { ascending: false }).limit(200);
    if (error) throw dbError(error);
    return ok((data ?? []).map((r) => toAdminPost(r as Parameters<typeof toAdminPost>[0])));
  },
);

export const POST = secureRoute<undefined, undefined, BlogPostInput, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: blogPostSchema, maxBodyBytes: 256 * 1024 },
  async ({ supabase, user, body, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data, error } = await supabase
      .from("blog_posts")
      .insert({ ...toColumns(body), created_by: user.id })
      .select("id")
      .single();
    if (error?.code === "23505") return fail("validation_failed", undefined, { slug: "Another post already uses this web address" }, requestId);
    if (error) throw dbError(error);
    await adminAudit({ adminId: user.id, action: "blog.created", targetType: "blog_post", targetId: data.id, metadata: { status: body.status }, ipHash });
    return ok({ id: data.id }, 201);
  },
);
