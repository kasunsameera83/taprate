// Platform admin request shapes (shared by the admin screens and the server).
import { z } from "zod";
import { cleanText } from "./schemas.ts";

const reason = z
  .string({ error: "Give a reason" })
  .max(1200)
  .transform((v) => cleanText(v))
  .pipe(z.string().min(3, "Give a reason (at least 3 characters)").max(300, "Keep the reason under 300 characters"));

export const adminCreditsSchema = z
  .object({
    amount: z.number({ error: "Enter a whole number" }).int("Enter a whole number").min(-1_000_000).max(1_000_000).refine((n) => n !== 0, "Enter an amount other than 0"),
    reason,
  })
  .strict();

export const adminSuspendSchema = z
  .object({ suspend: z.boolean(), reason: z.union([reason, z.literal("")]).optional() })
  .strict()
  .refine((v) => !v.suspend || (v.reason ?? "").length >= 3, { message: "Give a reason", path: ["reason"] });

export const adminBusinessesQuerySchema = z
  .object({
    search: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();

export const adminPageQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(500).default(1) }).strict();

export const adminLanguagesSchema = z.object({ enabled: z.boolean() }).strict();
