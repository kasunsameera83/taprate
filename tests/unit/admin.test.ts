import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LANDING, catalogItemSchema, isSafeCtaUrl, landingOrDefault, landingSchema, promotionSchema } from "../../src/lib/site/content.ts";
import { adminCreditsSchema, adminSuspendSchema } from "../../src/lib/validation/admin.ts";

test("landing content: defaults valid, limits enforced, bad data falls back", () => {
  assert.equal(landingSchema.safeParse(DEFAULT_LANDING).success, true);
  assert.equal(landingSchema.safeParse({ ...DEFAULT_LANDING, hero: { ...DEFAULT_LANDING.hero, title: "x".repeat(91) } }).success, false);
  assert.equal(landingSchema.safeParse({ ...DEFAULT_LANDING, faq: Array(13).fill({ q: "q", a: "a" }) }).success, false);
  assert.equal(landingSchema.safeParse({ ...DEFAULT_LANDING, script: "<script>" }).success, false, "strict: no extra fields");
  assert.equal(landingSchema.safeParse({ ...DEFAULT_LANDING, steps: [] }).success, false);
  const cleaned = landingSchema.parse({ ...DEFAULT_LANDING, hero: { ...DEFAULT_LANDING.hero, title: "  Hello‮   world  " } });
  assert.equal(cleaned.hero.title, "Hello world", "control and bidi characters removed");
  assert.deepEqual(landingOrDefault({ broken: true }), DEFAULT_LANDING);
  assert.deepEqual(landingOrDefault(null), DEFAULT_LANDING);
});

test("promotion links: https or our own paths only", () => {
  for (const ok of ["https://taprate.lk/offer", "/#pricing", "/signup?ref=avurudu"]) assert.equal(isSafeCtaUrl(ok), true, ok);
  for (const bad of ["javascript:alert(1)", "//evil.com", "http://evil.com", "data:text/html,x", "https://user:pw@evil.com", "/a b", " /x", "https://localhost"]) assert.equal(isSafeCtaUrl(bad), false, bad);
});

test("promotion schema", () => {
  const base = { kind: "popup", name: "Avurudu", title: "Suba Aluth Avuruddak Wewa!", body: "", ctaLabel: "See plans", ctaUrl: "/#pricing", theme: "avurudu", startsAt: "2027-04-10T00:00:00.000Z", endsAt: "2027-04-20T00:00:00.000Z", enabled: true };
  assert.equal(promotionSchema.safeParse(base).success, true);
  assert.equal(promotionSchema.safeParse({ ...base, ctaUrl: "" }).success, false, "button text without link");
  assert.equal(promotionSchema.safeParse({ ...base, ctaLabel: "", ctaUrl: "" }).success, true);
  assert.equal(promotionSchema.safeParse({ ...base, endsAt: base.startsAt }).success, false);
  assert.equal(promotionSchema.safeParse({ ...base, endsAt: "2029-04-20T00:00:00.000Z" }).success, false, "max one year");
  assert.equal(promotionSchema.safeParse({ ...base, theme: "halloween" }).success, false);
  assert.equal(promotionSchema.safeParse({ ...base, ctaUrl: "javascript:alert(1)" }).success, false);
});

test("price editing: typed amounts become minor units; nonsense refused", () => {
  const p = catalogItemSchema.parse({ kind: "plan", item: "growth", name: "Growth", blurb: "", responses: 2000, lkrMonth: "14,900", lkrYear: "149000", usdMonth: "49", usdYear: "490.50", active: true });
  assert.ok(p.kind === "plan" && p.lkrMonth === 1490000 && p.usdYear === 49050);
  assert.equal(catalogItemSchema.safeParse({ kind: "plan", item: "growth", name: "G", blurb: "", responses: 1, lkrMonth: "-5", lkrYear: "1", usdMonth: "1", usdYear: "1", active: true }).success, false);
  assert.equal(catalogItemSchema.safeParse({ kind: "plan", item: "enterprise", name: "G", blurb: "", responses: 1, lkrMonth: "5", lkrYear: "5", usdMonth: "5", usdYear: "5", active: true }).success, false, "fixed item ids");
  assert.equal(catalogItemSchema.safeParse({ kind: "topup", item: "pack_250", name: "250", responses: 250, lkrPrice: "3500", usdPrice: "12", active: true }).success, true);
  assert.equal(catalogItemSchema.safeParse({ kind: "topup", item: "pack_250", name: "250", responses: 250, lkrPrice: "0.10", usdPrice: "12", active: true }).success, false, "too low");
});

test("admin actions need reasons", () => {
  assert.equal(adminCreditsSchema.safeParse({ amount: 500, reason: "Goodwill" }).success, true);
  assert.equal(adminCreditsSchema.safeParse({ amount: 0, reason: "Goodwill" }).success, false);
  assert.equal(adminCreditsSchema.safeParse({ amount: 1.5, reason: "Goodwill" }).success, false);
  assert.equal(adminCreditsSchema.safeParse({ amount: 5, reason: "" }).success, false);
  assert.equal(adminSuspendSchema.safeParse({ suspend: true, reason: "" }).success, false);
  assert.equal(adminSuspendSchema.safeParse({ suspend: false }).success, true);
});
