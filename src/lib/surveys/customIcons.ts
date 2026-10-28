// Custom rating pictures and labels. Pure (works in the browser AND on the server, so both run exactly the
// same checks); unit-tested.
//
// Upload rules, checked from the file's actual bytes (never its name or the browser's claim):
//   * PNG, JPEG or WebP only. SVG is refused: it can contain scripts.
//   * Up to 200 KB; 32–1024 pixels on each side; roughly square.
//   * Not animated (animated images are distracting and can hide content).
//   * Hidden data (GPS location, camera details, comments) is removed before storing.
import { ICON_SETS, type IconSetId, type RatingOption } from "./iconSets.ts";
import { sniffImage, type LogoType } from "../branding.ts";

export const CUSTOMIZABLE_SETS: readonly IconSetId[] = ["thumbs", "faces3", "faces5", "stars5"];
export const ICON_MAX_BYTES = 200 * 1024;
export const ICON_MIN_PX = 32;
export const ICON_MAX_PX = 1024;

export const canCustomizeIcons = (set: IconSetId) => CUSTOMIZABLE_SETS.includes(set);

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u32be = (b: Uint8Array, i: number) => (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0;
const u24le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);

/** Width and height read from the image header. Null if the header is missing or broken. */
export function imageSize(b: Uint8Array, type: LogoType): { width: number; height: number } | null {
  if (type.ext === "png") {
    if (b.length < 24 || tag(b, 12) !== "IHDR") return null;
    return { width: u32be(b, 16), height: u32be(b, 20) };
  }
  if (type.ext === "jpg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = u16be(b, i + 2);
      // Start-of-frame markers (baseline, progressive, etc.) carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
      }
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  // WebP: VP8 (lossy), VP8L (lossless) or VP8X (extended).
  if (b.length < 30) return null;
  const chunk = tag(b, 12);
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: ((b[26] ?? 0) | ((b[27] ?? 0) << 8)) & 0x3fff, height: ((b[28] ?? 0) | ((b[29] ?? 0) << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/** True for animated PNG (acTL chunk) and animated WebP (animation flag / ANIM chunk). */
export function isAnimated(b: Uint8Array, type: LogoType): boolean {
  if (type.ext === "png") {
    let i = 8;
    while (i + 8 <= b.length) {
      const len = u32be(b, i);
      const t = tag(b, i + 4);
      if (t === "acTL") return true;
      if (t === "IDAT" || t === "IEND") return false; // animation control must come before image data
      i += 12 + len;
    }
    return false;
  }
  if (type.ext === "webp") {
    if (tag(b, 12) === "VP8X" && ((b[20] ?? 0) & 0x02) !== 0) return true;
    for (let i = 12; i + 8 <= b.length; ) {
      if (tag(b, i) === "ANIM" || tag(b, i) === "ANMF") return true;
      const size = (b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24)) >>> 0;
      i += 8 + size + (size % 2);
    }
  }
  return false;
}

export type IconCheck = { ok: true; type: LogoType; width: number; height: number } | { ok: false; reason: string };

export function checkIconImage(bytes: Uint8Array): IconCheck {
  if (bytes.length === 0) return { ok: false, reason: "The file is empty." };
  if (bytes.length > ICON_MAX_BYTES) return { ok: false, reason: "Pictures must be 200 KB or smaller." };
  const type = sniffImage(bytes);
  if (!type) return { ok: false, reason: "Use a PNG, JPG or WebP picture." };
  const size = imageSize(bytes, type);
  if (!size) return { ok: false, reason: "That picture looks damaged. Try saving it again." };
  if (size.width < ICON_MIN_PX || size.height < ICON_MIN_PX) return { ok: false, reason: `Pictures must be at least ${ICON_MIN_PX}×${ICON_MIN_PX} pixels.` };
  if (size.width > ICON_MAX_PX || size.height > ICON_MAX_PX) return { ok: false, reason: `Pictures must be at most ${ICON_MAX_PX}×${ICON_MAX_PX} pixels.` };
  const ratio = size.width / size.height;
  if (ratio < 0.8 || ratio > 1.25) return { ok: false, reason: "Use a square picture (or close to square)." };
  if (isAnimated(bytes, type)) return { ok: false, reason: "Animated pictures aren't supported. Use a still image." };
  return { ok: true, type, ...size };
}

const PATH_RE = /^accounts\/([0-9a-f-]{36})\/surveys\/([0-9a-f-]{36})\/icon-(\d{1,2})-[A-Za-z0-9_-]{16,40}\.(png|jpg|webp)$/;

export function isIconPath(path: unknown, accountId?: string, surveyId?: string): path is string {
  if (typeof path !== "string") return false;
  const m = PATH_RE.exec(path);
  if (!m) return false;
  return (!accountId || m[1] === accountId) && (!surveyId || m[2] === surveyId);
}

export function iconUrl(path: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!supabaseUrl || !isIconPath(path)) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/survey-icons/${path}`;
}

/** Stored path map -> public URL map (only values on the scale, only valid paths). */
export function iconUrlMap(iconSet: IconSetId, stored: unknown, supabaseUrl?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!canCustomizeIcons(iconSet) || !stored || typeof stored !== "object") return out;
  const values = new Set(ICON_SETS[iconSet].options.map((o) => String(o.value)));
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    const url = values.has(k) && typeof v === "string" ? iconUrl(v, supabaseUrl) : null;
    if (url) out[k] = url;
  }
  return out;
}

export function labelsFor(iconSet: IconSetId, stored: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!stored || typeof stored !== "object") return out;
  const values = new Set(ICON_SETS[iconSet].options.map((o) => String(o.value)));
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    if (values.has(k) && typeof v === "string" && v.length > 0 && v.length <= 24) out[k] = v;
  }
  return out;
}

export type ResolvedOption = RatingOption & { imageUrl: string | null };

/** The scale's options with the business's own labels and pictures applied. */
export function resolveOptions(iconSet: IconSetId, custom?: { images?: Record<string, string>; labels?: Record<string, string> }): ResolvedOption[] {
  return ICON_SETS[iconSet].options.map((o) => ({
    ...o,
    label: custom?.labels?.[String(o.value)] ?? o.label,
    imageUrl: custom?.images?.[String(o.value)] ?? null,
  }));
}
