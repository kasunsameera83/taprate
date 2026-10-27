import { randomBytes } from "node:crypto";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/server";
import { LOGO_MAX_BYTES, isLogoPath, logoUrl, readLimited, sniffImage, stripImageMetadata } from "@/lib/branding";
import { audit } from "@/lib/audit";

const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function currentLogo(accountId: string): Promise<string | null> {
  const { data } = await adminClient().from("accounts").select("logo_path").eq("id", accountId).maybeSingle();
  return isLogoPath(data?.logo_path) ? data.logo_path : null;
}

// Upload the business logo. Owner only. The request body is the raw image file.
// Checks: content type, size (header, and while reading), the file's real type from its bytes, and a valid
// file structure. Hidden metadata (EXIF/GPS, XMP, comments) is stripped before storing.
// Stored under a random name in this account's folder; users can't write to storage directly.
export const POST = secureRoute(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.upload },
  async ({ req, membership, user, ipHash, requestId }) => {
    const contentType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return fail("unsupported_media_type", "Upload a PNG, JPG or WebP image.", undefined, requestId);
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > LOGO_MAX_BYTES) return fail("payload_too_large", "Logos must be 512 KB or smaller.", undefined, requestId);

    // Stop reading as soon as the upload passes the limit (no matter what the headers claimed).
    const raw = await readLimited(req.body, LOGO_MAX_BYTES);
    if (raw === null) return fail("payload_too_large", "Logos must be 512 KB or smaller.", undefined, requestId);
    if (raw.length === 0) return fail("bad_request", "The file is empty.", undefined, requestId);
    const type = sniffImage(raw);
    if (!type) return fail("unsupported_media_type", "That file isn't a PNG, JPG or WebP image.", undefined, requestId);
    // Remove hidden data such as GPS location and camera details; reject files with a broken structure.
    const bytes = stripImageMetadata(raw, type);
    if (!bytes) return fail("unsupported_media_type", "That image file looks damaged. Try saving it again.", undefined, requestId);

    const path = `accounts/${membership.accountId}/logo-${randomBytes(12).toString("base64url")}.${type.ext}`;
    const db = adminClient();
    const { error: upErr } = await db.storage.from("logos").upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
    if (upErr) {
      console.error("[logo] upload failed", { message: upErr.message });
      return fail("unavailable", "Couldn't store the logo. Check the 'logos' storage bucket exists.", undefined, requestId);
    }

    const old = await currentLogo(membership.accountId);
    const { error } = await db.from("accounts").update({ logo_path: path }).eq("id", membership.accountId);
    if (error) {
      await db.storage.from("logos").remove([path]);
      return fail("unavailable", undefined, undefined, requestId);
    }
    if (old) await db.storage.from("logos").remove([old]);

    await audit({ accountId: membership.accountId, userId: user.id, action: "account.logo_updated", ipHash });
    return ok({ logoUrl: logoUrl(path) });
  },
);

export const DELETE = secureRoute(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.upload },
  async ({ membership, user, ipHash }) => {
    const db = adminClient();
    const old = await currentLogo(membership.accountId);
    await db.from("accounts").update({ logo_path: null }).eq("id", membership.accountId);
    if (old) await db.storage.from("logos").remove([old]);
    await audit({ accountId: membership.accountId, userId: user.id, action: "account.logo_removed", ipHash });
    return ok({ logoUrl: null });
  },
);
