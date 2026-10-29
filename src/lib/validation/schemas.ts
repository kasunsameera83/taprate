// Shared validation schemas. The SAME schema runs in the browser (instant feedback) and on the
// server (the real check). The server never trusts that the browser validated anything.
// Every object schema is .strict(): unknown fields are rejected, not silently ignored.
import { z } from "zod";
import { ICON_SET_IDS, ICON_SETS, type IconSetId } from "../surveys/iconSets.ts";
import { LANGS } from "../i18n/public.ts";

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// Control characters except tab/newline; also bidi overrides used to disguise text.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

export function cleanText(value: string, { multiline = false } = {}): string {
  let s = value.normalize("NFC").replace(CONTROL_CHARS, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n") : s.replace(/\s+/g, " ");
  return s.trim();
}

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be text`) })
    .max(max * 4, `${label} is too long`) // cheap guard before normalising huge input
    .transform((v) => cleanText(v))
    .pipe(z.string().min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`).max(max, `${label} must be at most ${max} characters`));

export const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .email("Enter a valid email address");

export const uuidSchema = z.string().uuid("Invalid id");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(10, "Use at least 10 characters")
  .max(128, "Password is too long")
  .refine((v) => !/^(.)\1+$/.test(v), "Password is too simple")
  .refine((v) => /[A-Za-z]/.test(v) && /[^A-Za-z]/.test(v), "Use letters and at least one number or symbol");

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    accountName: text(1, 80, "Business name"),
    acceptTerms: z.literal(true, { error: "Please agree to the Terms and Privacy Policy" }),
    // Invite code from a referral link (?ref=). Bad codes are refused here, unknown ones ignored later.
    ref: z.string().regex(/^[A-Z2-9]{8}$/, "Invalid invite code").optional(),
  })
  .strict();
export type SignUpInput = z.infer<typeof signUpSchema>;

/** "Send the confirmation email again". */
export const resendConfirmSchema = z.object({ email: emailSchema }).strict();
export type ResendConfirmInput = z.infer<typeof resendConfirmSchema>;

export const signInSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, "Password is required").max(128, "Password is too long"),
  })
  .strict();
export type SignInInput = z.infer<typeof signInSchema>;

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

const httpsUrl = z
  .string()
  .trim()
  .max(300, "URL is too long")
  .url("Enter a valid URL")
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "URL must start with https://");

// Reason chips customers can tap after rating ("Fast", "Friendly", "Slow reply"…).
export const driverLabel = z
  .string()
  .max(160)
  .transform((v) => cleanText(v))
  .pipe(z.string().min(1, "Reasons can't be empty").max(40, "Keep each reason under 40 characters"));
const driverList = z
  .array(driverLabel)
  .max(8, "Up to 8 reasons")
  .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, "Each reason must be different");

/** Custom labels for the rating buttons: { "<rating>": "label" }, up to 24 characters of plain text. */
export const optionLabelsSchema = z
  .record(
    z.string().regex(/^\d{1,2}$/),
    z
      .string()
      .max(100)
      .transform((v) => cleanText(v).replace(/[<>]/g, ""))
      .pipe(z.string().max(24, "Labels can be up to 24 characters")),
  )
  .refine((r) => Object.keys(r).length <= 11, "Too many labels")
  .transform((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.length > 0)));

const surveyFields = {
  name: text(1, 80, "Survey name"),
  question: text(1, 200, "Question"),
  iconSet: z.enum(ICON_SET_IDS, { error: "Choose a rating scale" }),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must look like #2563eb"),
  thankYouMessage: text(1, 300, "Thank-you message"),
  allowComment: z.boolean(),
  websiteUrl: z.union([httpsUrl, z.literal("").transform(() => null), z.null()]),
  alertThreshold: z.union([z.number().int().min(0).max(10), z.null()]),
  alertEmails: z
    .array(emailSchema)
    .max(10, "Up to 10 alert emails")
    .refine((a) => new Set(a).size === a.length, "Alert emails must be unique"),
  status: z.enum(["active", "paused", "archived"]),
  driversPositive: driverList,
  driversNegative: driverList,
  reviewCtaLabel: z.union([text(1, 40, "Button text"), z.literal("").transform(() => null), z.null()]),
  reviewCtaUrl: z.union([httpsUrl, z.literal("").transform(() => null), z.null()]),
  followupsEnabled: z.boolean(),
  followupDueHours: z.number({ error: "Choose how soon to follow up" }).int().min(1).max(720),
  optionLabels: optionLabelsSchema,
  language: z.enum(LANGS, { error: "Choose a language" }),
  recoveryEmail: z.boolean(),
  reasonsQuestionPositive: z.union([text(1, 80, "Question").refine((v) => !/[<>]/.test(v), "Questions can't contain < or >"), z.literal("").transform(() => null), z.null()]),
  reasonsQuestionNegative: z.union([text(1, 80, "Question").refine((v) => !/[<>]/.test(v), "Questions can't contain < or >"), z.literal("").transform(() => null), z.null()]),
};

function thresholdFits(iconSet: IconSetId, threshold: number | null): boolean {
  if (threshold === null) return true;
  const s = ICON_SETS[iconSet];
  return threshold >= s.min && threshold <= s.max;
}

const reviewPair = (v: { reviewCtaLabel?: string | null; reviewCtaUrl?: string | null }) =>
  v.reviewCtaLabel === undefined && v.reviewCtaUrl === undefined ? true : Boolean(v.reviewCtaLabel) === Boolean(v.reviewCtaUrl);

export const surveyCreateSchema = z
  .object({
    ...surveyFields,
    status: surveyFields.status.default("active"),
    driversPositive: driverList.default([]),
    driversNegative: driverList.default([]),
    reviewCtaLabel: surveyFields.reviewCtaLabel.default(null),
    reviewCtaUrl: surveyFields.reviewCtaUrl.default(null),
    followupsEnabled: z.boolean().default(true),
    followupDueHours: surveyFields.followupDueHours.default(48),
    optionLabels: optionLabelsSchema.default({}),
    language: surveyFields.language.default("en"),
    recoveryEmail: z.boolean().default(true),
    reasonsQuestionPositive: surveyFields.reasonsQuestionPositive.default(null),
    reasonsQuestionNegative: surveyFields.reasonsQuestionNegative.default(null),
  })
  .strict()
  .refine((v) => thresholdFits(v.iconSet, v.alertThreshold), {
    message: "Alert level must be within the rating scale",
    path: ["alertThreshold"],
  })
  .refine(reviewPair, { message: "Add both the button text and the link, or neither", path: ["reviewCtaUrl"] });
export type SurveyCreateInput = z.infer<typeof surveyCreateSchema>;

export const surveyUpdateSchema = z
  .object(surveyFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
  .refine(reviewPair, { message: "Add both the button text and the link, or neither", path: ["reviewCtaUrl"] });
export type SurveyUpdateInput = z.infer<typeof surveyUpdateSchema>;

export { thresholdFits };

// ---------------------------------------------------------------------------
// Snippet, reports, exports (query strings)
// ---------------------------------------------------------------------------

const mergeTag = z.string().max(80).regex(/^[A-Za-z0-9_.{}|*%$\[\]\- ]*$/, "Merge tag has unsupported characters");

export const snippetQuerySchema = z
  .object({
    preset: z.enum(["signature", "zendesk", "freshdesk", "hubspot", "gorgias", "helpscout", "mailchimp", "custom"]).default("signature"),
    email: mergeTag.optional(),
    agent: mergeTag.optional(),
    ticket: mergeTag.optional(),
  })
  .strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

export const responsesQuerySchema = z
  .object({
    surveyId: uuidSchema.optional(),
    rating: z.coerce.number().int().min(0).max(10).optional(),
    status: z.enum(["confirmed", "pending"]).default("confirmed"),
    sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
    hasComment: z.enum(["yes"]).optional(),
    shareable: z.enum(["yes", "featured"]).optional(),
    channel: z.enum(["email", "qr", "whatsapp", "sms", "link", "web", "kiosk", "import"]).optional(),
    agent: z.string().trim().max(100).optional(),
    locationId: uuidSchema.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "'from' must be before 'to'", path: ["from"] });
export type ResponsesQuery = z.infer<typeof responsesQuerySchema>;

export const exportQuerySchema = z
  .object({
    surveyId: uuidSchema.optional(),
    locationId: uuidSchema.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "'from' must be before 'to'", path: ["from"] });

export const statsQuerySchema = z
  .object({
    surveyId: uuidSchema.optional(),
    locationId: uuidSchema.optional(),
    days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30),
  })
  .strict();

export const accountUpdateSchema = z.object({ name: text(1, 80, "Business name") }).strict();

// ---------------------------------------------------------------------------
// Public (customer-facing) endpoints
// ---------------------------------------------------------------------------

const responseToken = z.string().max(60).regex(/^\d{10}\.[A-Za-z0-9_-]{22}$/, "Invalid token");

export const publicConfirmSchema = z
  .object({ responseId: uuidSchema, token: responseToken })
  .strict();

export const publicCommentSchema = z
  .object({
    responseId: uuidSchema,
    token: responseToken,
    comment: z
      .string()
      .max(8000)
      .transform((v) => cleanText(v, { multiline: true }))
      .pipe(z.string().min(1, "Write a comment first").max(2000, "Comment must be at most 2000 characters"))
      .optional(),
    // Reasons tapped by the customer. The server also checks they're offered by this survey.
    drivers: z.array(driverLabel).max(8).optional(),
    // Testimonials: the customer agrees their comment may be shown on the business's website.
    shareConsent: z.boolean().optional(),
    displayName: z
      .union([
        z
          .string()
          .max(160)
          .transform((v) => cleanText(v))
          .pipe(z.string().max(40, "Keep the name under 40 characters"))
          .refine((v) => !/[<>@]/.test(v), "Use just a first name"),
        z.null(),
      ])
      .optional(),
    // Honeypot: hidden field real people never fill in. Bots that fill every field are rejected.
    website: z.string().max(0, "Invalid submission").optional(),
  })
  .strict()
  .refine((v) => v.comment !== undefined || v.drivers !== undefined, { message: "Nothing to save", path: ["comment"] });

/**
 * Click links come from emails where merge tags may be unreplaced or mangled. A bad optional
 * field must not throw away the rating, so instead of rejecting we drop invalid values.
 */
export const LINK_CHANNELS = ["qr", "whatsapp", "sms", "link", "web"] as const;
export type Channel = "email" | (typeof LINK_CHANNELS)[number] | "kiosk";

export function parseClickParams(params: URLSearchParams): {
  email: string | null;
  agent: string | null;
  ticket: string | null;
  metaSig: string | null;
  channel: Channel;
} {
  const get = (k: string) => {
    const all = params.getAll(k);
    return all.length === 1 ? all[0] ?? null : null; // duplicated params are ambiguous: ignore
  };
  const looksLikeTag = (v: string) => /\{\{|\}\}|\*\||\|\*/.test(v);

  const rawEmail = get("e");
  const email = rawEmail && !looksLikeTag(rawEmail) ? emailSchema.safeParse(rawEmail) : null;

  const plain = (v: string | null, max: number) => {
    if (!v || looksLikeTag(v)) return null;
    const c = cleanText(v);
    return c.length > 0 && c.length <= max ? c : null;
  };

  const rawTicket = plain(get("t"), 100);
  const ticket = rawTicket && /^[A-Za-z0-9#._\/-]+$/.test(rawTicket) ? rawTicket : null;
  const sig = get("s");

  return {
    email: email && email.success ? email.data : null,
    agent: plain(get("a"), 100),
    ticket,
    metaSig: sig && /^[A-Za-z0-9_-]{22}$/.test(sig) ? sig : null,
    // Unknown or missing channel falls back to email (never trusted for anything but reporting).
    channel: (LINK_CHANNELS as readonly string[]).includes(get("c") ?? "") ? (get("c") as Channel) : "email",
  };
}

/** Flatten zod errors into { field: message } for forms and API responses. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Account security (Phase 1)
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const newPasswordSchema = z
  .object({
    newPassword: passwordSchema,
    // Only for "change password" while signed in; a reset link proves identity instead.
    currentPassword: z.string().min(1, "Enter your current password").max(128).optional(),
  })
  .strict();

export const changeEmailSchema = z
  .object({
    email: emailSchema,
    currentPassword: z.string().min(1, "Enter your current password").max(128),
  })
  .strict();

const totpCode = z
  .string({ error: "Enter the 6-digit code" })
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your app"));

export const mfaCodeSchema = z.object({ code: totpCode }).strict();
export const mfaConfirmSchema = z.object({ factorId: uuidSchema, code: totpCode }).strict();

// ---------------------------------------------------------------------------
// Team (Phase 1)
// ---------------------------------------------------------------------------

const agentName = z
  .string()
  .max(400)
  .transform((v) => cleanText(v))
  .pipe(z.string().max(100, "Agent name must be at most 100 characters"));

export const inviteCreateSchema = z
  .object({
    email: emailSchema,
    role: z.enum(["admin", "viewer", "agent"], { error: "Choose a role" }),
    agentName: z.union([agentName, z.null()]).optional(),
  })
  .strict()
  .refine((v) => v.role !== "agent" || (v.agentName ?? "").length > 0, {
    message: "Enter the agent's name exactly as your helpdesk shows it",
    path: ["agentName"],
  });
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;

export const memberUpdateSchema = z
  .object({
    role: z.enum(["owner", "admin", "viewer", "agent"], { error: "Choose a role" }),
    agentName: z.union([agentName, z.null()]).optional(),
  })
  .strict()
  .refine((v) => v.role !== "agent" || (v.agentName ?? "").length > 0, {
    message: "Enter the agent's name exactly as your helpdesk shows it",
    path: ["agentName"],
  });

export const accountSwitchSchema = z.object({ accountId: uuidSchema }).strict();
export const accountCreateSchema = z.object({ name: text(1, 80, "Business name") }).strict();

// ---------------------------------------------------------------------------
// Privacy (Phase 1)
// ---------------------------------------------------------------------------

export const eraseCustomerSchema = z.object({ email: emailSchema }).strict();

export const deleteAccountSchema = z
  .object({
    confirmName: z.string().min(1, "Type the business name to confirm").max(200),
    password: z.string().min(1, "Enter your password").max(128),
  })
  .strict();

export const auditQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(200).default(1) })
  .strict();

// ---------------------------------------------------------------------------
// Follow-ups & leaderboard (Phase 2)
// ---------------------------------------------------------------------------

export const followupsQuerySchema = z
  .object({
    status: z.enum(["open", "in_progress", "resolved", "overdue", "active"]).default("active"),
    mine: z.enum(["yes"]).optional(),
    surveyId: uuidSchema.optional(),
    page: z.coerce.number().int().min(1).max(500).default(1),
  })
  .strict();

export const followupUpdateSchema = z
  .object({
    status: z.enum(["open", "in_progress", "resolved"]).optional(),
    assigneeId: z.union([uuidSchema, z.null()]).optional(),
    dueAt: z
      .union([z.string().datetime({ offset: true, error: "Choose a valid date" }), z.null()])
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const followupNoteSchema = z
  .object({
    body: z
      .string()
      .max(8000)
      .transform((v) => cleanText(v, { multiline: true }))
      .pipe(z.string().min(1, "Write a note first").max(2000, "Notes must be at most 2000 characters")),
  })
  .strict();

export const leaderboardQuerySchema = z
  .object({
    surveyId: uuidSchema.optional(),
    days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30),
    minRatings: z.coerce.number().int().min(1).max(100).default(5),
  })
  .strict();

// ---------------------------------------------------------------------------
// Channels & integrations (Phase 3)
// ---------------------------------------------------------------------------

export const kioskRateSchema = z
  .object({
    kiosk: z.string().max(100).regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/, "Invalid kiosk link"),
    rating: z.number().int().min(0).max(10),
  })
  .strict();

export const kioskCreateSchema = z.object({ name: text(1, 60, "Kiosk name"), locationId: z.union([uuidSchema, z.null()]).optional() }).strict();

// Branches and locations
export const locationCreateSchema = z
  .object({ name: text(1, 60, "Branch name").refine((v) => !/[<>]/.test(v), "Branch names can't contain < or >") })
  .strict();
export const locationUpdateSchema = z
  .object({ name: text(1, 60, "Branch name").refine((v) => !/[<>]/.test(v), "Branch names can't contain < or >"), archived: z.boolean() })
  .strict();
export const featureSchema = z.object({ featured: z.boolean() }).strict();
export const tvScreenCreateSchema = z
  .object({
    name: text(1, 60, "Screen name").refine((v) => !/[<>]/.test(v), "Names can't contain < or >"),
    surveyId: z.union([uuidSchema, z.null()]),
    locationId: z.union([uuidSchema, z.null()]),
    showComments: z.boolean(),
  })
  .strict();
export const shareQuerySchema = z.object({ locationId: uuidSchema.optional() }).strict();

export const integrationCreateSchema = z
  .object({
    kind: z.enum(["slack", "teams", "webhook"], { error: "Choose where to send alerts" }),
    name: text(1, 60, "Name"),
    url: z.string().trim().min(1, "Paste the webhook URL").max(1000, "That URL is too long"),
    events: z.array(z.enum(["negative", "all"])).min(1, "Choose at least one event").max(2),
  })
  .strict();
export type IntegrationCreateInput = z.infer<typeof integrationCreateSchema>;

export const integrationUpdateSchema = z
  .object({
    name: text(1, 60, "Name").optional(),
    enabled: z.boolean().optional(),
    events: z.array(z.enum(["negative", "all"])).min(1).max(2).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

// ---------------------------------------------------------------------------
// Public API, helpdesk post-back, CSV import (Phase 4)
// ---------------------------------------------------------------------------

/** Ticket references: same rule as the one-click link uses. */
export const TICKET_RE = /^[A-Za-z0-9#._\/-]{1,100}$/;
const MERGE_TAG_LIKE = /\{\{|\}\}|\*\||\|\*/;

export const apiKeyCreateSchema = z
  .object({
    name: text(1, 60, "Name"),
    access: z.enum(["read", "read_write"], { error: "Choose what the key can do" }),
    expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()], { error: "Choose when the key expires" }),
    password: z.string().min(1, "Enter your password").max(128),
  })
  .strict();
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

const isoDateTime = z.string().max(40).datetime({ offset: true, error: "Use an ISO 8601 date-time, e.g. 2026-10-01T00:00:00Z" });

export const apiSurveysQuerySchema = z
  .object({ status: z.enum(["active", "paused", "all"]).default("all") })
  .strict();

export const apiResponsesQuerySchema = z
  .object({
    survey_id: uuidSchema.optional(),
    since: isoDateTime.optional(),
    until: isoDateTime.optional(),
    sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
    channel: z.enum(["email", "qr", "whatsapp", "sms", "link", "web", "kiosk", "import"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(120).regex(/^[A-Za-z0-9_-]+$/, "Invalid cursor").optional(),
  })
  .strict()
  .refine((v) => !v.since || !v.until || Date.parse(v.since) <= Date.parse(v.until), { message: "'since' must be before 'until'", path: ["since"] });
export type ApiResponsesQuery = z.infer<typeof apiResponsesQuerySchema>;

/** Recipient details to sign into rating links. Values must survive the click link's own parsing unchanged. */
export const apiLinksSchema = z
  .object({
    email: emailSchema.optional(),
    agent: z
      .string()
      .max(400)
      .transform((v) => cleanText(v))
      .pipe(z.string().min(1, "Agent can't be empty").max(100, "Agent must be at most 100 characters"))
      .refine((v) => !MERGE_TAG_LIKE.test(v), "Agent looks like an unreplaced merge tag")
      .optional(),
    ticket: z.string().trim().regex(TICKET_RE, "Ticket may use letters, numbers and # . _ / - (up to 100)").optional(),
    location_id: uuidSchema.optional(),
  })
  .strict();
export type ApiLinksInput = z.infer<typeof apiLinksSchema>;

// Helpdesks: we build the URL ourselves from the subdomain, so nobody can point us at another host.
const subdomain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, "Use just the first part of your helpdesk address, e.g. acme");

export const helpdeskCreateSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("zendesk"),
      name: text(1, 60, "Name"),
      subdomain,
      email: emailSchema,
      apiToken: z.string().trim().min(20, "Paste the API token from Zendesk").max(100, "That token is too long").regex(/^[A-Za-z0-9]+$/, "That doesn't look like a Zendesk API token"),
      events: z.array(z.enum(["negative", "all"])).min(1).max(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("freshdesk"),
      name: text(1, 60, "Name"),
      subdomain,
      apiKey: z.string().trim().min(10, "Paste your Freshdesk API key").max(100, "That key is too long").regex(/^[A-Za-z0-9]+$/, "That doesn't look like a Freshdesk API key"),
      events: z.array(z.enum(["negative", "all"])).min(1).max(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("gorgias"),
      name: text(1, 60, "Name"),
      subdomain,
      // The Gorgias user the API key belongs to; notes are written as this user.
      email: emailSchema,
      apiKey: z.string().trim().min(20, "Paste the API key from Gorgias").max(128, "That key is too long").regex(/^[A-Za-z0-9_-]+$/, "That doesn't look like a Gorgias API key"),
      events: z.array(z.enum(["negative", "all"])).min(1).max(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("intercom"),
      name: text(1, 60, "Name"),
      region: z.enum(["us", "eu", "au"], { error: "Choose your Intercom region" }),
      accessToken: z.string().trim().min(20, "Paste your Intercom access token").max(300, "That token is too long").regex(/^[A-Za-z0-9_\-=+/.:]+$/, "That doesn't look like an Intercom access token"),
      events: z.array(z.enum(["negative", "all"])).min(1).max(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("front"),
      name: text(1, 60, "Name"),
      // Front API tokens are signed tokens (three dot-separated parts).
      apiToken: z
        .string()
        .trim()
        .min(40, "Paste your Front API token")
        .max(1500, "That token is too long")
        .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "That doesn't look like a Front API token"),
      events: z.array(z.enum(["negative", "all"])).min(1).max(2),
    })
    .strict(),
]);
export type HelpdeskCreateInput = z.infer<typeof helpdeskCreateSchema>;

const shopifySigningKey = z
  .string()
  .trim()
  .min(16, "Paste the signing key from Shopify")
  .max(200, "That key is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "That doesn't look like a Shopify signing key");

// Shopify: the shop's address, the webhook signing key Shopify shows in Settings → Notifications → Webhooks,
// and the survey to email after an order.
export const shopifyCreateSchema = z
  .object({
    name: text(1, 60, "Name"),
    shop: z
      .string()
      .trim()
      .toLowerCase()
      .max(200, "That address is too long")
      .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .transform((v) => (v.includes(".") ? v : `${v}.myshopify.com`))
      .pipe(z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/, "Use your shop's myshopify.com address, like acme.myshopify.com")),
    // Shopify only shows the key once a shop has a webhook, so it can be added after connecting.
    signingSecret: shopifySigningKey.optional(),
    surveyId: uuidSchema,
  })
  .strict();
export type ShopifyCreateInput = z.infer<typeof shopifyCreateSchema>;
export const shopifyKeySchema = z.object({ signingSecret: shopifySigningKey }).strict();

// CSV import. One row after the browser has mapped the columns; the server checks every row again.
export const IMPORT_MAX_ROWS = 5000;

export const importRowSchema = z
  .object({
    date: z
      .string()
      .max(40)
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, "Date must be like 2025-03-14 or 2025-03-14 09:30")
      .refine((v) => {
        const t = Date.parse(v);
        return Number.isFinite(t) && t >= Date.parse("2000-01-01T00:00:00Z") && t <= Date.now() + 86_400_000;
      }, "Date must be between 2000 and today"),
    rating: z.number({ error: "Rating must be a whole number" }).int("Rating must be a whole number").min(0).max(10),
    email: emailSchema.optional(),
    comment: z
      .string()
      .max(8000)
      .transform((v) => cleanText(v, { multiline: true }))
      .pipe(z.string().min(1).max(2000, "Comment must be at most 2000 characters"))
      .optional(),
    agent: z
      .string()
      .max(400)
      .transform((v) => cleanText(v))
      .pipe(z.string().min(1).max(100, "Agent must be at most 100 characters"))
      .optional(),
    ticket: z.string().trim().regex(TICKET_RE, "Ticket may use letters, numbers and # . _ / -").optional(),
  })
  .strict();
export type ImportRow = z.infer<typeof importRowSchema>;

export const importSchema = z
  .object({
    fileName: text(1, 120, "File name"),
    rows: z.array(z.unknown()).min(1, "The file has no rows").max(IMPORT_MAX_ROWS, `Up to ${IMPORT_MAX_ROWS} rows per import`),
  })
  .strict();

// ---------------------------------------------------------------------------
// Billing (Phase 5). Prices are NEVER accepted from the browser: only ids from the server catalog.
// ---------------------------------------------------------------------------

export const billingProfileSchema = z
  .object({
    firstName: text(1, 60, "First name"),
    lastName: text(1, 60, "Last name"),
    email: emailSchema,
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number like +94 77 123 4567"),
    address: text(1, 200, "Address"),
    city: text(1, 80, "City"),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a country"),
    company: z.union([text(1, 120, "Company"), z.literal("").transform(() => null), z.null()]).optional(),
    taxId: z.union([text(1, 40, "Tax / VAT number"), z.literal("").transform(() => null), z.null()]).optional(),
  })
  .strict();
export type BillingProfileInput = z.infer<typeof billingProfileSchema>;

export const checkoutSchema = z
  .object({
    item: z.enum(["starter", "growth", "scale", "pack_250", "pack_1000", "pack_5000"], { error: "Choose a plan or pack" }),
    interval: z.enum(["month", "year"]).optional(),
    provider: z.enum(["payhere", "stripe"], { error: "Choose how to pay" }),
    // Optional: PayHere can charge in rupees or (when switched on) dollars. Stripe is always dollars.
    currency: z.enum(["LKR", "USD"]).optional(),
    promoCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,30}$/, "That code isn't valid.").optional(),
  })
  .strict()
  .refine((v) => (v.item.startsWith("pack_") ? v.interval === undefined : v.interval !== undefined), { message: "Choose monthly or yearly", path: ["interval"] });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** "What would this code do?" — same fields as checkout, code required. */
export const promoPreviewSchema = z
  .object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,30}$/, "That code isn't valid."), provider: z.enum(["payhere", "stripe"]), currency: z.enum(["LKR", "USD"]).optional(), interval: z.enum(["month", "year"]) })
  .strict();

const promoItems = z.array(z.enum(["starter", "growth", "scale", "pack_250", "pack_1000", "pack_5000"])).max(6);
const moneyText = z
  .string()
  .trim()
  .transform((v) => v.replace(/,/g, ""))
  .pipe(z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 1000 or 5.00"))
  .transform((v) => Math.round(Number(v) * 100));

export const promoCodeSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{4,30}$/, "4–30 letters, numbers, - or _"),
    description: z.union([text(1, 120, "Description"), z.literal("")]),
    kind: z.enum(["percent", "amount", "credits"], { error: "Choose what the code gives" }),
    percentOff: z.number().int().min(1, "1–90%").max(90, "Up to 90% (use bonus responses for free extras)").nullable(),
    amountOffLkr: z.union([moneyText, z.literal("").transform(() => null), z.null()]),
    amountOffUsd: z.union([moneyText, z.literal("").transform(() => null), z.null()]),
    bonusCredits: z.number().int().min(1).max(1_000_000).nullable(),
    appliesTo: promoItems,
    maxUses: z.number().int().min(1).max(1_000_000).nullable(),
    startsAt: z.string().datetime({ offset: true, error: "Choose a start date" }),
    endsAt: z.union([z.string().datetime({ offset: true }), z.null()]),
    enabled: z.boolean(),
  })
  .strict()
  .refine((v) => v.kind !== "percent" || v.percentOff !== null, { message: "Enter the percentage", path: ["percentOff"] })
  .refine((v) => v.kind !== "amount" || v.amountOffLkr !== null || v.amountOffUsd !== null, { message: "Enter an amount in LKR, USD or both", path: ["amountOffLkr"] })
  .refine((v) => v.amountOffLkr === null || v.amountOffLkr >= 100, { message: "At least Rs 1", path: ["amountOffLkr"] })
  .refine((v) => v.amountOffUsd === null || v.amountOffUsd >= 50, { message: "At least $0.50", path: ["amountOffUsd"] })
  .refine((v) => v.kind !== "credits" || v.bonusCredits !== null, { message: "Enter the bonus responses", path: ["bonusCredits"] })
  .refine((v) => !v.endsAt || Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: "The end must be after the start", path: ["endsAt"] });
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;

// ---------------------------------------------------------------------------
// Insights (Phase 6)
// ---------------------------------------------------------------------------

const periodDays = z.union([z.literal(7), z.literal(30), z.literal(90)], { error: "Choose 7, 30 or 90 days" });

export const insightCreateSchema = z.object({ surveyId: z.union([uuidSchema, z.null()]).optional(), days: periodDays }).strict();
export const insightsQuerySchema = z.object({ surveyId: uuidSchema.optional() }).strict();
export const aiSettingSchema = z.object({ enabled: z.boolean() }).strict();

export const reportSettingSchema = z
  .object({
    frequency: z.enum(["off", "weekly", "monthly"], { error: "Choose how often" }),
    surveyId: z.union([uuidSchema, z.null()]).optional(),
    includeAi: z.boolean().optional(),
  })
  .strict();

export const reportQuerySchema = z
  .object({
    surveyId: uuidSchema.optional(),
    days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30),
  })
  .strict();
