// Blog post rules, shared by the editor (instant checks) and the server (the real check).
import { z } from "zod";
import { cleanText } from "../validation/schemas.ts";

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Why one tap beats ten questions!" -> "why-one-tap-beats-ten-questions" */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const line = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .max(max * 4)
    .transform((v) => cleanText(v))
    .pipe(z.string().min(min, min > 1 ? `${label} must be at least ${min} characters` : `${label} is required`).max(max, `${label} must be at most ${max} characters`));

export const blogPostSchema = z
  .object({
    title: line(3, 120, "Title"),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "Web address must be at least 3 characters")
      .max(80, "Web address must be at most 80 characters")
      .regex(SLUG_RE, "Use lowercase letters, numbers and dashes, e.g. why-one-tap-works"),
    excerpt: z
      .string()
      .max(1200)
      .transform((v) => cleanText(v))
      .pipe(z.string().max(300, "Summary must be at most 300 characters")),
    body: z
      .string()
      .max(60000, "The post is too long (60,000 characters at most)")
      .transform((v) => v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")),
    seoDescription: z.union([line(1, 160, "Search description"), z.literal("").transform(() => null), z.null()]),
    authorName: line(2, 60, "Author"),
    status: z.enum(["draft", "published"]),
    /** When it goes live (ISO). Empty = now, when publishing. A future date schedules it. */
    publishedAt: z.union([z.string().max(40).datetime({ offset: true, error: "Choose a valid date" }), z.literal("").transform(() => null), z.null()]),
  })
  .strict();
export type BlogPostInput = z.infer<typeof blogPostSchema>;
