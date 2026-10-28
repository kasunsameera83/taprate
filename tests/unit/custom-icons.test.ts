import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIconImage, iconUrlMap, imageSize, isIconPath, resolveOptions } from "../../src/lib/surveys/customIcons.ts";
import { optionLabelsSchema } from "../../src/lib/validation/schemas.ts";
import { stripImageMetadata } from "../../src/lib/branding.ts";
import { buildSnippetHtml } from "../../src/lib/surveys/snippet.ts";

const ACC = "0f1e2d3c-4b5a-4968-8776-655443322110";
const SUR = "5a000000-0000-4000-8000-000000000001";

function chunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}
function png(w: number, h: number, extra: number[][] = []): Uint8Array {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", [...be(w), ...be(h), 8, 6, 0, 0, 0]), ...extra.flat(), ...chunk("IDAT", [1, 2, 3]), ...chunk("IEND", [])]);
}
function jpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}
function webpX(w: number, h: number, animated: boolean): Uint8Array {
  const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
  const body = [..."VP8X"].map((c) => c.charCodeAt(0)).concat([10, 0, 0, 0, animated ? 0x02 : 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]);
  const size = 4 + body.length;
  return new Uint8Array([..."RIFF"].map((c) => c.charCodeAt(0)).concat([size & 255, (size >> 8) & 255, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0)), body));
}

test("pictures: real type, size, shape and stillness are all checked", () => {
  assert.deepEqual(checkIconImage(png(256, 256)).ok, true);
  assert.equal(checkIconImage(png(16, 16)).ok, false, "too small");
  assert.equal(checkIconImage(png(2000, 2000)).ok, false, "too big");
  assert.equal(checkIconImage(png(64, 200)).ok, false, "not square");
  assert.equal(checkIconImage(png(128, 128, [chunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0])])).ok, false, "animated PNG");
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(checkIconImage(svg).ok, false, "SVG refused");
  const big = new Uint8Array(210 * 1024);
  big.set(png(256, 256));
  assert.equal(checkIconImage(big).ok, false, "over 200 KB");
  assert.equal(checkIconImage(new Uint8Array()).ok, false);
  assert.deepEqual(imageSize(jpeg(300, 280), { ext: "jpg", mime: "image/jpeg" }), { width: 300, height: 280 });
  assert.equal(checkIconImage(jpeg(300, 280)).ok, true);
  assert.equal(checkIconImage(webpX(128, 128, false)).ok, true);
  assert.equal(checkIconImage(webpX(128, 128, true)).ok, false, "animated WebP");
  // A PNG with a hidden text chunk: still valid after cleaning, and the text is gone.
  const withText = png(64, 64, [chunk("tEXt", [...new TextEncoder().encode("GPS 6.9271,79.8612")])]);
  const cleaned = stripImageMetadata(withText, { ext: "png", mime: "image/png" })!;
  assert.ok(cleaned && !new TextDecoder().decode(cleaned).includes("GPS"));
  assert.equal(checkIconImage(cleaned).ok, true);
});

test("storage paths stay inside the survey's own folder", () => {
  const p = `accounts/${ACC}/surveys/${SUR}/icon-5-abcdefghijklmnop.png`;
  assert.equal(isIconPath(p, ACC, SUR), true);
  assert.equal(isIconPath(p, ACC, "5b000000-0000-4000-8000-000000000001"), false);
  assert.equal(isIconPath(`accounts/${ACC}/surveys/${SUR}/../../x.png`), false);
  assert.equal(isIconPath(`accounts/${ACC}/surveys/${SUR}/icon-5-abcdefghijklmnop.svg`), false);
  const urls = iconUrlMap("faces5", { "5": p, "9": p, "4": "https://evil.com/x.png" }, "https://abc.supabase.co");
  assert.deepEqual(Object.keys(urls), ["5"], "only valid paths on the scale");
  assert.equal(urls["5"], `https://abc.supabase.co/storage/v1/object/public/survey-icons/${p}`);
  assert.deepEqual(iconUrlMap("nps", { "5": p }, "https://abc.supabase.co"), {}, "number scales don't get pictures");
});

test("labels: short plain text", () => {
  assert.deepEqual(optionLabelsSchema.parse({ "5": "  Loved   it ", "1": "" }), { "5": "Loved it" }, "blank labels dropped");
  assert.deepEqual(optionLabelsSchema.parse({ "3": "<b>OK</b>" }), { "3": "bOK/b" }, "angle brackets removed");
  assert.equal(optionLabelsSchema.safeParse({ "3": "x".repeat(30) }).success, false);
  assert.equal(optionLabelsSchema.safeParse({ abc: "x" }).success, false);
});

test("email buttons: custom picture only from our storage, label always shown", () => {
  const good = `https://abc.supabase.co/storage/v1/object/public/survey-icons/accounts/${ACC}/surveys/${SUR}/icon-5-abcdefghijklmnop.png`;
  const options = resolveOptions("faces5", { images: { "5": good, "4": "https://evil.com/x.png\" onerror=\"alert(1)" }, labels: { "5": 'Loved "it"' } });
  const html = buildSnippetHtml({ appUrl: "https://app.example", surveyId: SUR, iconSet: "faces5", question: "How did we do?", brandColor: "#2563eb", mergeTags: { email: "", agent: "", ticket: "" }, signToken: (s, r) => `${s}.${r}.AAAAAAAAAAAAAAAAAAAAAA`, options });
  assert.ok(html.includes(`<img src="${good}"`));
  assert.ok(!html.includes("evil.com"), "outside URLs are ignored");
  assert.ok(html.includes("Loved &quot;it&quot;"), "label escaped");
});
