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
};

function thresholdFits(iconSet: IconSetId, threshold: number | null): boolean {
  if (threshold === null) return true;
  const s = ICON_SETS[iconSet];
  return threshold >= s.min && threshold <= s.max;
}

export const surveyCreateSchema = z
  .object({ ...surveyFields, status: surveyFields.status.default("active") })
  .strict()
  .refine((v) => thresholdFits(v.iconSet, v.alertThreshold), {
    message: "Alert level must be within the rating scale",
    path: ["alertThreshold"],
  });
export type SurveyCreateInput = z.infer<typeof surveyCreateSchema>;

export const surveyUpdateSchema = z
  .object(surveyFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
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
      .pipe(z.string().min(1, "Write a comment first").max(2000, "Comment must be at most 2000 characters")),
    // Honeypot: hidden field real people never fill in. Bots that fill every field are rejected.
    website: z.string().max(0, "Invalid submission").optional(),
  })
  .strict();

/**
 * Click links come from emails where merge tags may be unreplaced or mangled. A bad optional
 * field must not throw away the rating, so instead of rejecting we drop invalid values.
 */
export function parseClickParams(params: URLSearchParams): {
  email: string | null;
  agent: string | null;
  ticket: string | null;
  metaSig: string | null;
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
