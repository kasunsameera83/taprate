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

// ---------------------------------------------------------------------------
// Metadata stripping: removes hidden data (EXIF incl. GPS location, XMP, comments, text chunks)
// without re-encoding the image. Returns null if the file structure is broken (then we reject it).
// ---------------------------------------------------------------------------

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD"]);

function stripPng(b: Uint8Array): Uint8Array | null {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= b.length) {
    const len = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  return sawEnd ? concat(out) : null;
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  const out: Uint8Array[] = [b.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xd9) {
      out.push(b.subarray(i, i + 2));
      return concat(out);
    }
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    const end = i + 2 + len;
    if (len < 2 || end > b.length) return null;
    // Drop APP1/APP3-APP15 (EXIF, XMP, Photoshop...) and comments. Keep APP0 (JFIF) and APP2 (colour profile).
    const isApp = marker >= 0xe1 && marker <= 0xef;
    const drop = (isApp && marker !== 0xe2) || marker === 0xfe;
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      out.push(b.subarray(i));
      return concat(out);
    }
    if (!drop) out.push(b.subarray(i, end));
    i = end;
  }
  return null;
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);
    const size = (b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24)) >>> 0;
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > b.length) return null;
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = b.slice(i, Math.min(end, b.length));
      // VP8X header carries "has EXIF/XMP" flags: clear them.
      if (type === "VP8X" && chunk.length > 8) chunk[8] = chunk[8]! & ~0x0c;
      chunks.push(chunk);
    }
    i = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 4), 0); // RIFF
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >> 8) & 0xff;
  header[6] = (riffSize >> 16) & 0xff;
  header[7] = (riffSize >>> 24) & 0xff;
  header.set(b.subarray(8, 12), 8); // WEBP
  return concat([header, body]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function stripImageMetadata(bytes: Uint8Array, type: LogoType): Uint8Array | null {
  try {
    if (type.ext === "png") return stripPng(bytes);
    if (type.ext === "jpg") return stripJpeg(bytes);
    return stripWebp(bytes);
  } catch {
    return null;
  }
}

/** Reads a request body but stops (returns null) as soon as it exceeds maxBytes. */
export async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  return concat(parts);
}
