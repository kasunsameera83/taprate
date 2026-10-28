// Validation for survey emails sent by TapRate. Same schemas in the browser and on the server; the
// database checks every value a third time.
import { z } from "zod";
import { cleanText, emailSchema, TICKET_RE } from "./schemas.ts";

export const SEND_MAX_RECIPIENTS = 1000;
export const REMINDER_CHOICES = [3, 5, 7] as const;
export const SKIP_RECENT_CHOICES = [0, 30, 60, 90] as const;

const plain = (max: number, label: string) =>
  z
    .string()
    .max(max * 4, `${label} is too long`)
    .transform((v) => cleanText(v))
    .pipe(z.string().max(max, `${label} must be at most ${max} characters`))
    .refine((v) => !/[<>]/.test(v), `${label} can't contain < or >`);

export const recipientSchema = z
  .object({
    email: emailSchema,
    name: plain(80, "Name").optional(),
    agent: plain(100, "Agent").optional(),
    ticket: z.string().trim().regex(TICKET_RE, "Ticket may use letters, numbers and # . _ / -").optional(),
  })
  .strict()
  .transform((r) => ({
    email: r.email,
    ...(r.name ? { name: r.name } : {}),
    ...(r.agent ? { agent: r.agent } : {}),
    ...(r.ticket ? { ticket: r.ticket } : {}),
  }));
export type Recipient = z.infer<typeof recipientSchema>;

export const sendCreateSchema = z
  .object({
    name: plain(80, "Send name").pipe(z.string().min(1, "Give this send a name")),
    subject: plain(150, "Subject").pipe(z.string().min(1, "Add a subject line")),
    intro: z
      .string()
      .max(4000, "Message is too long")
      .transform((v) => cleanText(v, { multiline: true }))
      .pipe(z.string().max(1000, "Keep the message under 1,000 characters")),
    replyTo: z.union([emailSchema, z.literal("").transform(() => null), z.null()]),
    reminderDays: z.union([z.literal(3), z.literal(5), z.literal(7), z.null()]),
    skipRecentDays: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90)]),
    recipients: z.array(recipientSchema).min(1, "Add at least one email address").max(SEND_MAX_RECIPIENTS, `Up to ${SEND_MAX_RECIPIENTS.toLocaleString("en")} people per send`),
    confirmCustomers: z.literal(true, { error: "Please confirm these are your customers" }),
  })
  .strict();
export type SendCreateInput = z.infer<typeof sendCreateSchema>;

export const suppressionSchema = z.object({ email: emailSchema }).strict();

/** POST /api/v1/surveys/{id}/send */
export const apiSendSchema = z
  .object({
    email: emailSchema,
    name: plain(80, "name").optional(),
    agent: plain(100, "agent").optional(),
    ticket: z.string().trim().regex(TICKET_RE, "ticket may use letters, numbers and # . _ / -").optional(),
    skip_recent_days: z.number().int().min(0).max(365).optional(),
  })
  .strict();
export type ApiSendInput = z.infer<typeof apiSendSchema>;
