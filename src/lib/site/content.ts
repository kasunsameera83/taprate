// Landing page content and promotions: the shape, the defaults and the rules. Shared by the admin editor
// (instant checks in the browser) and the server (the real check). Everything is plain text: the page
// renders it as text, so nobody can inject HTML or scripts through the editor.
import { z } from "zod";
import { cleanText } from "../validation/schemas.ts";

const t = (max: number, label: string, min = 1) =>
  z
    .string({ error: `${label} is required` })
    .max(max * 4)
    .transform((v) => cleanText(v))
    .pipe(z.string().min(min, `${label} is required`).max(max, `${label} must be at most ${max} characters`));
const long = (max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .max(max * 4)
    .transform((v) => cleanText(v, { multiline: true }))
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`));
const item = z.object({ title: t(60, "Title"), body: long(300, "Text") }).strict();

export const landingSchema = z
  .object({
    seo: z.object({ title: t(70, "Page title"), description: t(160, "Search description") }).strict(),
    hero: z
      .object({
        title: t(90, "Headline"),
        subtitle: long(300, "Sub-headline"),
        primaryCta: t(30, "Main button"),
        note: z.union([t(100, "Small print"), z.literal("")]),
      })
      .strict(),
    stepsTitle: t(60, "Steps heading"),
    steps: z.array(item).min(1, "Add at least one step").max(6, "Up to 6 steps"),
    featuresTitle: t(60, "Features heading"),
    features: z.array(item).max(9, "Up to 9 features"),
    trust: item,
    pricing: z.object({ show: z.boolean(), title: t(60, "Pricing heading"), subtitle: z.union([long(200, "Pricing text"), z.literal("")]) }).strict(),
    faqTitle: t(60, "FAQ heading"),
    faq: z.array(z.object({ q: t(140, "Question"), a: long(600, "Answer") }).strict()).max(12, "Up to 12 questions"),
    finalCta: z.object({ title: t(90, "Closing headline"), button: t(30, "Closing button") }).strict(),
    footer: z.object({ tagline: z.union([t(120, "Footer text"), z.literal("")]) }).strict(),
  })
  .strict();
export type Landing = z.infer<typeof landingSchema>;

export const DEFAULT_LANDING: Landing = {
  seo: { title: "TapRate: one-click customer feedback", description: "Add rating buttons to the emails you already send. Customers tap once; you see who's happy and who needs a call back." },
  hero: {
    title: "Know how every customer felt about every email.",
    subtitle: "Add rating buttons to the emails your team already sends. Customers tap once; you see who's happy and who needs a call back, the moment it happens.",
    primaryCta: "Start free",
    note: "50 free responses. No card needed.",
  },
  stepsTitle: "Set up in five minutes",
  steps: [
    { title: "Write one question", body: "“How did we do?” Pick faces, stars, thumbs or a 0–10 score." },
    { title: "Paste the buttons", body: "Into your Gmail or Outlook signature, or your Zendesk, Freshdesk or HubSpot replies." },
    { title: "Customers tap once", body: "No survey link, no form. The tap is the answer, and it shows up on your dashboard." },
    { title: "Fix what went wrong", body: "An unhappy rating opens a follow-up with an owner and a due date. Call back, put it right, mark it resolved." },
  ],
  featuresTitle: "Everything you need to act on feedback",
  features: [
    { title: "Follow-ups", body: "Unhappy ratings open a follow-up with an owner and a due date, so nobody slips through." },
    { title: "QR, WhatsApp and kiosk", body: "Collect ratings at the counter, on receipts, in chats and on your website, not just email." },
    { title: "Team leaderboard", body: "See which agents customers love, and who needs coaching." },
    { title: "Slack, Teams and helpdesks", body: "Alerts where your team works, and ratings added to Zendesk and Freshdesk tickets." },
  ],
  trust: {
    title: "Only real customers are counted",
    body: "Corporate email scanners open every link in an email, which fills other tools with fake ratings. TapRate holds each click until a real browser confirms it, so scanners are never counted and never use up your responses. Every link is signed, and your data is kept separate from every other business.",
  },
  pricing: { show: true, title: "Simple pricing", subtitle: "Start free with 50 responses. Unused responses roll over, and you can cancel any time." },
  faqTitle: "Questions",
  faq: [
    { q: "Do customers need to log in or fill a form?", a: "No. They tap a face or a number in your email and that's the answer. They can add a comment if they want." },
    { q: "What counts as a response?", a: "One confirmed rating. Clicks by email security scanners are never counted." },
  ],
  finalCta: { title: "Start hearing from every customer today.", button: "Start free" },
  footer: { tagline: "One-click customer feedback." },
};

/** Published content, checked again on the way out; anything invalid falls back to the defaults. */
export function landingOrDefault(raw: unknown): Landing {
  const r = landingSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_LANDING;
}

// ---------------------------------------------------------------------------
// Promotions: a pop-up offer, or a seasonal greeting banner, each for a date range.
// ---------------------------------------------------------------------------

export const THEMES = {
  generic: { label: "Simple", emoji: "✨", from: "#2f3bf5", to: "#5b63f7" },
  sale: { label: "Sale / offer", emoji: "🏷️", from: "#b91c1c", to: "#ea580c" },
  avurudu: { label: "Sinhala & Tamil New Year", emoji: "🌞", from: "#b45309", to: "#dc2626" },
  vesak: { label: "Vesak", emoji: "🏮", from: "#1d4ed8", to: "#ca8a04" },
  poson: { label: "Poson", emoji: "🪷", from: "#7c3aed", to: "#db2777" },
  deepavali: { label: "Deepavali", emoji: "🪔", from: "#c2410c", to: "#a16207" },
  ramadan: { label: "Ramadan / Eid", emoji: "🌙", from: "#065f46", to: "#0f766e" },
  christmas: { label: "Christmas", emoji: "🎄", from: "#166534", to: "#b91c1c" },
  newyear: { label: "New Year", emoji: "🎆", from: "#1e1b4b", to: "#6d28d9" },
  valentine: { label: "Valentine's Day", emoji: "💝", from: "#be185d", to: "#e11d48" },
} as const;
export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Only https links, or paths on our own site. Never javascript:, data: or //other-site. */
export function isSafeCtaUrl(v: string): boolean {
  if (v.length > 300 || /\s/.test(v)) return false;
  if (v.startsWith("/")) return !v.startsWith("//") && /^\/[A-Za-z0-9/_?=&.#-]*$/.test(v);
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export const promotionSchema = z
  .object({
    kind: z.enum(["popup", "greeting"], { error: "Choose pop-up or greeting" }),
    name: t(60, "Internal name"),
    title: t(80, "Title"),
    body: z.union([long(300, "Message"), z.literal("").transform(() => null), z.null()]),
    ctaLabel: z.union([t(30, "Button text"), z.literal("").transform(() => null), z.null()]),
    ctaUrl: z.union([z.string().trim().max(300).refine(isSafeCtaUrl, "Use an https:// link or a path like /#pricing"), z.literal("").transform(() => null), z.null()]),
    theme: z.enum(THEME_IDS as [ThemeId, ...ThemeId[]]),
    startsAt: z.string().datetime({ offset: true, error: "Choose a start date" }),
    endsAt: z.string().datetime({ offset: true, error: "Choose an end date" }),
    enabled: z.boolean(),
  })
  .strict()
  .refine((v) => Boolean(v.ctaLabel) === Boolean(v.ctaUrl), { message: "Add both the button text and the link, or neither", path: ["ctaUrl"] })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: "The end must be after the start", path: ["endsAt"] })
  .refine((v) => Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 366 * 86_400_000, { message: "Up to one year", path: ["endsAt"] });
export type PromotionInput = z.infer<typeof promotionSchema>;

export type PublicPromotion = { id: string; kind: "popup" | "greeting"; title: string; body: string | null; ctaLabel: string | null; ctaUrl: string | null; theme: ThemeId };

// Admin price editing: amounts typed in major units ("14,900" / "49.00"), stored in minor units.
const money = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, `${label}: enter an amount like 14900 or 49.00`))
    .transform((v) => Math.round(Number(v) * 100))
    .pipe(z.number().int().min(50, `${label} is too low`).max(100_000_000_000));

export const catalogItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("plan"),
      item: z.enum(["starter", "growth", "scale"]),
      name: t(40, "Name"),
      blurb: z.union([t(120, "Description"), z.literal("")]),
      responses: z.number({ error: "Responses must be a number" }).int().min(1).max(1_000_000),
      lkrMonth: money("LKR monthly"),
      lkrYear: money("LKR yearly"),
      usdMonth: money("USD monthly"),
      usdYear: money("USD yearly"),
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("topup"),
      item: z.enum(["pack_250", "pack_1000", "pack_5000"]),
      name: t(40, "Name"),
      responses: z.number({ error: "Responses must be a number" }).int().min(1).max(1_000_000),
      lkrPrice: money("LKR price"),
      usdPrice: money("USD price"),
      active: z.boolean(),
    })
    .strict(),
]);
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
