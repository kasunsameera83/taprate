import { randomBytes } from "node:crypto";
import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { readLimited, sniffImage, stripImageMetadata } from "@/lib/branding";
import { ICON_MAX_BYTES, canCustomizeIcons, checkIconImage, iconUrl, isIconPath } from "@/lib/surveys/customIcons";
import { ICON_SETS, isIconSetId } from "@/lib/surveys/iconSets";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema, value: z.string().regex(/^\d{1,2}$/) }).strict();
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BUCKET = "survey-icons";

/** The survey, only if it belongs to this business and isn't archived; plus its current pictures. */
async function loadSurvey(accountId: string, surveyId: string) {
  const { data } = await adminClient()
    .from("surveys")
    .select("id, account_id, icon_set, status, icon_images")
    .eq("id", surveyId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!data || data.status === "archived" || !isIconSetId(data.icon_set)) return null;
  return data as { id: string; account_id: string; icon_set: Parameters<typeof canCustomizeIcons>[0]; status: string; icon_images: Record<string, string> | null };
}

// Upload a custom picture for one rating button. Owners/admins. The body is the raw image file.
// Checks, in order: size header -> content type -> size while reading -> real type from the bytes ->
// dimensions and shape -> not animated -> hidden metadata removed -> checked again after cleaning.
// Stored under a random name in this survey's own folder; users can't write to storage directly, and the
// database re-checks the path belongs to this survey.
export const POST = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.upload, params },
  async ({ req, membership, user, params, ipHash, requestId }) => {
    const survey = await loadSurvey(membership.accountId, params.id);
    if (!survey) return fail("not_found", undefined, undefined, requestId);
    if (!canCustomizeIcons(survey.icon_set)) return fail("validation_failed", "Custom pictures are available for faces, thumbs and stars.", undefined, requestId);
    const value = Number(params.value);
    if (!ICON_SETS[survey.icon_set].options.some((o) => o.value === value)) return fail("not_found", undefined, undefined, requestId);

    if (Number(req.headers.get("content-length") ?? "0") > ICON_MAX_BYTES) return fail("payload_too_large", "Pictures must be 200 KB or smaller.", undefined, requestId);
    const contentType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return fail("unsupported_media_type", "Use a PNG, JPG or WebP picture.", undefined, requestId);
    const raw = await readLimited(req.body, ICON_MAX_BYTES);
    if (raw === null) return fail("payload_too_large", "Pictures must be 200 KB or smaller.", undefined, requestId);

    const check = checkIconImage(raw);
    if (!check.ok) return fail("validation_failed", check.reason, undefined, requestId);
    const cleaned = stripImageMetadata(raw, check.type);
    if (!cleaned || sniffImage(cleaned)?.ext !== check.type.ext || !checkIconImage(cleaned).ok) {
      return fail("validation_failed", "That picture looks damaged. Try saving it again.", undefined, requestId);
    }

    const path = `accounts/${membership.accountId}/surveys/${survey.id}/icon-${value}-${randomBytes(12).toString("base64url")}.${check.type.ext}`;
    const db = adminClient();
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, cleaned, { contentType: check.type.mime, upsert: false, cacheControl: "31536000" });
    if (upErr) {
      console.error("[icons] upload failed", { message: upErr.message });
      return fail("unavailable", "Couldn't store the picture. Check the 'survey-icons' storage bucket exists.", undefined, requestId);
    }
    const old = survey.icon_images?.[String(value)];
    const next = { ...(survey.icon_images ?? {}), [String(value)]: path };
    const { error } = await db.from("surveys").update({ icon_images: next }).eq("id", survey.id).eq("account_id", membership.accountId);
    if (error) {
      await db.storage.from(BUCKET).remove([path]);
      return fail("unavailable", undefined, undefined, requestId);
    }
    if (isIconPath(old, membership.accountId, survey.id)) await db.storage.from(BUCKET).remove([old]);
    await audit({ accountId: membership.accountId, userId: user.id, action: "survey.icon_updated", targetType: "survey", targetId: survey.id, metadata: { rating: value }, ipHash });
    return ok({ value, url: iconUrl(path) });
  },
);

// Go back to the standard picture for one rating button.
export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.upload, params },
  async ({ membership, user, params, ipHash, requestId }) => {
    const survey = await loadSurvey(membership.accountId, params.id);
    if (!survey) return fail("not_found", undefined, undefined, requestId);
    const key = String(Number(params.value));
    const old = survey.icon_images?.[key];
    const next = { ...(survey.icon_images ?? {}) };
    delete next[key];
    const db = adminClient();
    const { error } = await db.from("surveys").update({ icon_images: next }).eq("id", survey.id).eq("account_id", membership.accountId);
    if (error) return fail("unavailable", undefined, undefined, requestId);
    if (isIconPath(old, membership.accountId, survey.id)) await db.storage.from(BUCKET).remove([old]);
    await audit({ accountId: membership.accountId, userId: user.id, action: "survey.icon_removed", targetType: "survey", targetId: survey.id, metadata: { rating: Number(key) }, ipHash });
    return ok({ removed: true });
  },
);
