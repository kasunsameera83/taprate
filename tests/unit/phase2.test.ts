import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffImage, isLogoPath, LOGO_MAX_BYTES } from "../../src/lib/branding.ts";
import { computeStats, leaderboard } from "../../src/lib/surveys/stats.ts";
import { sentimentOf, isValidRating } from "../../src/lib/surveys/iconSets.ts";
import { buildSnippetHtml } from "../../src/lib/surveys/snippet.ts";
import { buildLinkToken } from "../../src/lib/security/signing.ts";
import { readableTextOn } from "../../src/lib/surveys/color.ts";

test("logo: real file type comes from the bytes", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const gif = new TextEncoder().encode("GIF89a....");
  const html = new TextEncoder().encode("<html><script>x</script></html>");
  assert.deepEqual(sniffImage(png), { ext: "png", mime: "image/png" });
  assert.deepEqual(sniffImage(jpg), { ext: "jpg", mime: "image/jpeg" });
  assert.deepEqual(sniffImage(webp), { ext: "webp", mime: "image/webp" });
  assert.equal(sniffImage(svg), null, "SVG refused (can contain scripts)");
  assert.equal(sniffImage(gif), null);
  assert.equal(sniffImage(html), null);
  assert.equal(sniffImage(new Uint8Array([])), null);
  assert.equal(LOGO_MAX_BYTES, 524288);
});

test("logo: only well-formed storage paths are accepted", () => {
  assert.equal(isLogoPath("accounts/5a000000-0000-4000-8000-000000000001/logo-AbCdEfGh12345678.png"), true);
  assert.equal(isLogoPath("accounts/5a000000-0000-4000-8000-000000000001/logo-x.png"), false, "name too short");
  assert.equal(isLogoPath("accounts/../../secret/logo-AbCdEfGh12345678.png"), false);
  assert.equal(isLogoPath("accounts/5a000000-0000-4000-8000-000000000001/logo-AbCdEfGh12345678.svg"), false);
  assert.equal(isLogoPath("javascript:alert(1)"), false);
  assert.equal(isLogoPath(null), false);
});

test("CES scale: 1-7, thresholds match the database", () => {
  assert.equal(isValidRating("ces", 7), true);
  assert.equal(isValidRating("ces", 8), false);
  assert.equal(isValidRating("ces", 0), false);
  assert.equal(sentimentOf("ces", 7), "positive");
  assert.equal(sentimentOf("ces", 5), "positive");
  assert.equal(sentimentOf("ces", 4), "neutral");
  assert.equal(sentimentOf("ces", 3), "negative");
  assert.equal(sentimentOf("ces", 1), "negative");
});

test("CES email buttons: numbered, with an end-label legend", () => {
  const html = buildSnippetHtml({
    appUrl: "https://app.example",
    surveyId: "5a000000-0000-4000-8000-000000000001",
    iconSet: "ces",
    question: "How easy was it?",
    brandColor: "#2f3bf5",
    mergeTags: { email: "", agent: "", ticket: "" },
    signToken: (id, r) => buildLinkToken("test-secret-0123456789-abcdefghijklmnop", id, r),
  });
  assert.equal((html.match(/<a /g) ?? []).length, 7);
  assert.ok(html.includes("1 = Very difficult"));
  assert.ok(html.includes("7 = Very easy"));
});

test("stats: CES average and top reasons", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const rows = [
    { rating: 7, iconSet: "ces" as const, createdAt: "2026-10-27T09:00:00Z", agent: null, drivers: [] },
    { rating: 4, iconSet: "ces" as const, createdAt: "2026-10-27T09:00:00Z", agent: null },
    { rating: 5, iconSet: "faces5" as const, createdAt: "2026-10-27T09:00:00Z", agent: null, drivers: ["Fast", "Friendly"] },
    { rating: 4, iconSet: "faces5" as const, createdAt: "2026-10-26T09:00:00Z", agent: null, drivers: ["Fast"] },
    { rating: 1, iconSet: "faces5" as const, createdAt: "2026-10-26T09:00:00Z", agent: null, drivers: ["Slow reply"] },
  ];
  const s = computeStats(rows, [], { days: 7, now });
  assert.deepEqual(s.ces, { average: 5.5, total: 2 });
  assert.deepEqual(s.drivers.positive, [
    { label: "Fast", count: 2 },
    { label: "Friendly", count: 1 },
  ]);
  assert.deepEqual(s.drivers.negative, [{ label: "Slow reply", count: 1 }]);
});

test("leaderboard: ranks fairly, merges name case, sets aside small samples", () => {
  const mk = (agent: string, rating: number, day = "2026-10-27") => ({ rating, iconSet: "faces5" as const, createdAt: `${day}T09:00:00Z`, agent });
  const current = [
    ...Array.from({ length: 5 }, () => mk("Sarah", 5)),
    ...Array.from({ length: 4 }, () => mk("nimal", 5)),
    mk("Nimal", 1),
    mk("Lucky", 5),
  ];
  const previous = [mk("Sarah", 1, "2026-09-20"), mk("Sarah", 5, "2026-09-20")];
  const b = leaderboard(current, previous, 5);
  assert.deepEqual(
    b.ranked.map((r) => [r.agent, r.total, r.satisfactionPct]),
    [
      ["Sarah", 5, 100],
      ["nimal", 5, 80],
    ],
  );
  assert.equal(b.ranked[0]?.previousSatisfactionPct, 50);
  assert.equal(b.ranked[1]?.negative, 1);
  assert.deepEqual(b.tooFew.map((r) => r.agent), ["Lucky"], "one lucky rating can't top the board");
});

test("brand colour buttons stay readable", () => {
  assert.equal(readableTextOn("#2f3bf5"), "#ffffff");
  assert.equal(readableTextOn("#facc15"), "#151a2d", "dark text on yellow");
  assert.equal(readableTextOn("#ffffff"), "#151a2d");
  assert.equal(readableTextOn("#000000"), "#ffffff");
});

test("phase 2 schemas: reasons, review button, follow-ups, public reasons", async () => {
  const s = await import("../../src/lib/validation/schemas.ts");
  const base = {
    name: "Support",
    question: "How did we do?",
    iconSet: "faces5",
    brandColor: "#2563eb",
    thankYouMessage: "Thanks!",
    allowComment: true,
    websiteUrl: null,
    alertThreshold: 2,
    alertEmails: [],
  };
  const ok = s.surveyCreateSchema.safeParse(base);
  assert.ok(ok.success);
  assert.deepEqual(ok.data.driversPositive, []);
  assert.equal(ok.data.followupDueHours, 48);
  assert.ok(s.surveyCreateSchema.safeParse({ ...base, iconSet: "ces", alertThreshold: 3 }).success);

  const bad: Array<[string, unknown]> = [
    ["driversPositive", ["Fast", "fast"]],
    ["driversPositive", Array.from({ length: 9 }, (_, i) => `r${i}`)],
    ["driversNegative", ["x".repeat(41)]],
    ["driversNegative", [""]],
    ["followupDueHours", 0],
    ["followupDueHours", 10000],
    ["reviewCtaUrl", "javascript:alert(1)"],
  ];
  for (const [field, value] of bad) assert.equal(s.surveyCreateSchema.safeParse({ ...base, [field]: value }).success, false, `${field}=${JSON.stringify(value).slice(0, 30)}`);
  assert.equal(s.surveyCreateSchema.safeParse({ ...base, reviewCtaLabel: "Review us", reviewCtaUrl: null }).success, false, "label without link");
  assert.ok(s.surveyCreateSchema.safeParse({ ...base, reviewCtaLabel: "Review us", reviewCtaUrl: "https://g.page/r/x/review" }).success);

  const tok = { responseId: "7c000000-0000-4000-8000-000000000003", token: `1800000000.${"A".repeat(22)}` };
  assert.ok(s.publicCommentSchema.safeParse({ ...tok, drivers: ["Fast"] }).success, "reasons without a comment");
  assert.equal(s.publicCommentSchema.safeParse({ ...tok }).success, false, "nothing to save");
  assert.equal(s.publicCommentSchema.safeParse({ ...tok, drivers: Array.from({ length: 9 }, (_, i) => `r${i}`) }).success, false);

  assert.ok(s.followupUpdateSchema.safeParse({ status: "resolved" }).success);
  assert.equal(s.followupUpdateSchema.safeParse({ status: "done" }).success, false);
  assert.equal(s.followupUpdateSchema.safeParse({}).success, false);
  assert.equal(s.followupUpdateSchema.safeParse({ dueAt: "tomorrow" }).success, false);
  assert.ok(s.followupUpdateSchema.safeParse({ dueAt: "2026-11-01T10:00:00.000Z" }).success);
  assert.equal(s.followupNoteSchema.safeParse({ body: "   " }).success, false);
  assert.equal(s.leaderboardQuerySchema.safeParse({ days: "45" }).success, false);
});

test("logo metadata is stripped and broken files are rejected", async () => {
  const { stripImageMetadata, readLimited } = await import("../../src/lib/branding.ts");
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, data: number[]) => [...u32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const gps = [...new TextEncoder().encode("GPS 6.9271N 79.8612E")];
  const png = new Uint8Array([...sig, ...chunk("IHDR", Array(13).fill(1)), ...chunk("tEXt", gps), ...chunk("eXIf", gps), ...chunk("IDAT", [9, 9]), ...chunk("IEND", [])]);
  const clean = stripImageMetadata(png, { ext: "png", mime: "image/png" })!;
  const text = new TextDecoder("latin1").decode(clean);
  assert.ok(!text.includes("GPS"), "PNG text/EXIF removed");
  assert.ok(text.includes("IHDR") && text.includes("IDAT") && text.includes("IEND"), "image data kept");
  assert.equal(stripImageMetadata(png.subarray(0, png.length - 6), { ext: "png", mime: "image/png" }), null, "truncated PNG rejected");

  const app1 = [0xff, 0xe1, 0x00, gps.length + 2, ...gps];
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 1, 2, ...app1, 0xff, 0xda, 0x00, 0x02, 7, 7, 7, 0xff, 0xd9]);
  const cleanJ = stripImageMetadata(jpg, { ext: "jpg", mime: "image/jpeg" })!;
  assert.ok(!new TextDecoder("latin1").decode(cleanJ).includes("GPS"), "JPEG EXIF removed");
  assert.equal(cleanJ[0], 0xff);
  assert.equal(cleanJ[1], 0xd8);
  assert.equal(stripImageMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x00]), { ext: "jpg", mime: "image/jpeg" }), null, "broken JPEG rejected");

  const stream = (n: number) => new Blob([new Uint8Array(n)]).stream();
  assert.equal((await readLimited(stream(100), 512))?.length, 100);
  assert.equal(await readLimited(stream(600 * 1024), 512 * 1024), null, "stops reading over the limit");
});
