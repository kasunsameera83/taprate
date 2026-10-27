import "server-only";
import { z } from "zod";

// Server configuration is validated once, at first use. A missing or weak secret stops the
// app with a clear error instead of running insecurely.
const secret = (name: string) =>
  z.string({ required_error: `${name} is not set` }).min(32, `${name} must be at least 32 characters`);

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  LINK_SIGNING_SECRET: secret("LINK_SIGNING_SECRET"),
  LINK_SIGNING_SECRET_PREVIOUS: z.union([secret("LINK_SIGNING_SECRET_PREVIOUS"), z.literal("")]).optional(),
  RESPONSE_TOKEN_SECRET: secret("RESPONSE_TOKEN_SECRET"),
  IP_HASH_SALT: z.string().min(16, "IP_HASH_SALT must be at least 16 characters"),
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM_EMAIL: z.string().email().optional().or(z.literal("")),
});

export type ServerEnv = z.infer<typeof schema> & { linkSecrets: string[]; appOrigin: string };

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration: ${problems}`);
  }
  const e = parsed.data;
  const secrets = [e.LINK_SIGNING_SECRET, e.LINK_SIGNING_SECRET_PREVIOUS ?? ""].filter((s) => s.length > 0);
  if (new Set([e.LINK_SIGNING_SECRET, e.RESPONSE_TOKEN_SECRET, e.IP_HASH_SALT]).size !== 3) {
    throw new Error("Invalid server configuration: each secret must be different");
  }
  if (process.env.NODE_ENV === "production" && !e.NEXT_PUBLIC_APP_URL.startsWith("https://")) {
    throw new Error("Invalid server configuration: NEXT_PUBLIC_APP_URL must use https in production");
  }
  cached = { ...e, linkSecrets: secrets, appOrigin: new URL(e.NEXT_PUBLIC_APP_URL).origin };
  return cached;
}
