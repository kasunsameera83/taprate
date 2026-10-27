// Logo helpers. Pure functions, safe in browser and server; unit-tested.

export const LOGO_MAX_BYTES = 512 * 1024;
export type LogoType = { ext: "png" | "jpg" | "webp"; mime: "image/png" | "image/jpeg" | "image/webp" };

/**
 * Identify an image by its first bytes (never trust the file name or the browser's content type).
 * Only PNG, JPEG and WebP are accepted. SVG is refused on purpose: it can carry scripts.
 */
export function sniffImage(bytes: Uint8Array): LogoType | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) {
    return { ext: "png", mime: "image/png" };
  }
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (
    bytes.length >= 12 &&
    b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && // RIFF
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50 // WEBP
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

const LOGO_PATH_RE = /^accounts\/[0-9a-f-]{36}\/logo-[A-Za-z0-9_-]{8,40}\.(png|jpg|webp)$/;

export function isLogoPath(path: unknown): path is string {
  return typeof path === "string" && LOGO_PATH_RE.test(path);
}

/** Public URL of a stored logo, or null. Validates the path so nothing odd ends up in an <img src>. */
export function logoUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !isLogoPath(path)) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/logos/${path}`;
}
