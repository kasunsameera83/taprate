import { randomBytes } from "node:crypto";
import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminAudit, assertPlatformAdmin } from "@/lib/admin";
import { uuidSchema } from "@/lib/validation/schemas";
import { readLimited, sniffImage, stripImageMetadata } from "@/lib/branding";
import { coverUrl, isCoverPath } from "@/lib/blog/server";
import { adminClient } from "@/lib/supabase/server";

const params = z.object({ id: uuidSchema }).strict();
const MAX_BYTES = 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const BUCKET = "blog-images";

// Upload a post's cover picture. Owner console only. The body is the raw image file.
// Checks: content type -> size (header and while reading) -> real type from the bytes -> hidden data
// (GPS, camera details) removed and the file re-checked. Stored under a random name in the post's folder.
export const POST = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.upload, params },
  async ({ req, supabase, user, params, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data: post, error: pErr } = await supabase.from("blog_posts").select("id, cover_path").eq("id", params.id).maybeSingle();
    if (pErr) throw dbError(pErr);
    if (!post) return fail("not_found", undefined, undefined, requestId);

    const contentType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED.has(contentType)) return fail("unsupported_media_type", "Use a PNG, JPG or WebP picture.", undefined, requestId);
    if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) return fail("payload_too_large", "Cover pictures must be 1 MB or smaller.", undefined, requestId);
    const raw = await readLimited(req.body, MAX_BYTES);
    if (raw === null) return fail("payload_too_large", "Cover pictures must be 1 MB or smaller.", undefined, requestId);
    if (raw.length === 0) return fail("bad_request", "The file is empty.", undefined, requestId);
    const type = sniffImage(raw);
    if (!type) return fail("unsupported_media_type", "That file isn't a PNG, JPG or WebP picture.", undefined, requestId);
    const bytes = stripImageMetadata(raw, type);
    if (!bytes || sniffImage(bytes)?.ext !== type.ext) return fail("unsupported_media_type", "That picture looks damaged. Try saving it again.", undefined, requestId);

    const path = `posts/${params.id}/cover-${randomBytes(12).toString("base64url")}.${type.ext}`;
    const storage = adminClient().storage.from(BUCKET);
    const { error: upErr } = await storage.upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
    if (upErr) {
      console.error("[blog] cover upload failed", { message: upErr.message });
      return fail("unavailable", "Couldn't store the picture. Check the 'blog-images' storage bucket exists.", undefined, requestId);
    }
    const { error } = await supabase.from("blog_posts").update({ cover_path: path, updated_at: new Date().toISOString() }).eq("id", params.id);
    if (error) {
      await storage.remove([path]);
      throw dbError(error);
    }
    if (isCoverPath(post.cover_path, params.id)) await storage.remove([post.cover_path]);
    await adminAudit({ adminId: user.id, action: "blog.cover_updated", targetType: "blog_post", targetId: params.id, ipHash });
    return ok({ coverUrl: coverUrl(path) });
  },
);

export const DELETE = secureRoute<z.infer<typeof params>, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.upload, params },
  async ({ supabase, user, params, ipHash, requestId }) => {
    await assertPlatformAdmin(supabase);
    const { data: post, error: pErr } = await supabase.from("blog_posts").select("id, cover_path").eq("id", params.id).maybeSingle();
    if (pErr) throw dbError(pErr);
    if (!post) return fail("not_found", undefined, undefined, requestId);
    const { error } = await supabase.from("blog_posts").update({ cover_path: null, updated_at: new Date().toISOString() }).eq("id", params.id);
    if (error) throw dbError(error);
    if (isCoverPath(post.cover_path, params.id)) await adminClient().storage.from(BUCKET).remove([post.cover_path]);
    await adminAudit({ adminId: user.id, action: "blog.cover_removed", targetType: "blog_post", targetId: params.id, ipHash });
    return ok({ coverUrl: null });
  },
);
