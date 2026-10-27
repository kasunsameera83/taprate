// Shared validation schemas. The SAME schema runs in the browser (instant feedback) and on the
// server (the real check). The server never trusts that the browser validated anything.
// Every object schema is .strict(): unknown fields are rejected, not silently ignored.
import { z } from "zod";
import { ICON_SET_IDS, ICON_SETS, type IconSetId } from "../surveys/iconSets.ts";

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
  })
  .strict();
export type SignUpInput = z.infer<typeof signUpSchema>;

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
    preset: z.enum(["signature", "zendesk", "freshdesk", "hubspot", "mailchimp", "custom"]).default("signature"),
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
    channel: z.enum(["email", "qr", "whatsapp", "sms", "link", "web", "kiosk"]).optional(),
    agent: z.string().trim().max(100).optional(),
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
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "'from' must be before 'to'", path: ["from"] });

export const statsQuerySchema = z
  .object({
    surveyId: uuidSchema.optional(),
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

export const kioskCreateSchema = z.object({ name: text(1, 60, "Kiosk name") }).strict();

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
