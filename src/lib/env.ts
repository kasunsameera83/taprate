import "server-only";
import { z } from "zod";

// Server configuration is validated once, at first use. A missing or weak secret stops the
// app with a clear error instead of running insecurely.
const secret = (name: string) =>
  z.string({ error: `${name} is not set` }).min(32, `${name} must be at least 32 characters`);

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
  CRON_SECRET: z.union([secret("CRON_SECRET"), z.literal("")]).optional(),
  ALERT_FROM_EMAIL: z.string().email().optional().or(z.literal("")),
  // Billing (optional: each provider is switched on only when its settings are present).
  PAYHERE_MERCHANT_ID: z.string().regex(/^\d{1,20}$/, "PAYHERE_MERCHANT_ID must be digits").optional().or(z.literal("")),
  PAYHERE_MERCHANT_SECRET: z.string().min(10, "PAYHERE_MERCHANT_SECRET looks too short").optional().or(z.literal("")),
  PAYHERE_APP_ID: z.string().max(100).optional().or(z.literal("")),
  PAYHERE_APP_SECRET: z.string().max(200).optional().or(z.literal("")),
  PAYHERE_SANDBOX: z.enum(["true", "false"]).default("true"),
  PAYHERE_USD_ENABLED: z.enum(["true", "false", ""]).optional(),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, "STRIPE_SECRET_KEY must start with sk_test_ or sk_live_").optional().or(z.literal("")),
  // AI summaries (optional). Model defaults to the fast, low-cost Haiku.
  ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-[A-Za-z0-9_-]+$/, "ANTHROPIC_API_KEY must start with sk-ant-").optional().or(z.literal("")),
  ANTHROPIC_MODEL: z.string().regex(/^claude-[a-z0-9.-]{3,60}$/, "ANTHROPIC_MODEL must be a Claude model id").default("claude-haiku-5-5"),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9]+$/, "STRIPE_WEBHOOK_SECRET must start with whsec_").optional().or(z.literal("")),
  // Bounce and spam-complaint notices from Resend (optional but recommended when sending surveys).
  // Phone/desktop alerts (optional). Make them with: node scripts/vapid-keys.mjs
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{86,88}$/, "VAPID_PUBLIC_KEY looks wrong (run node scripts/vapid-keys.mjs)").optional().or(z.literal("")),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{42,44}$/, "VAPID_PRIVATE_KEY looks wrong (run node scripts/vapid-keys.mjs)").optional().or(z.literal("")),
  VAPID_SUBJECT: z.string().regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/, "VAPID_SUBJECT must be mailto:you@domain or an https URL").optional().or(z.literal("")),
  RESEND_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9+/=]+$/, "RESEND_WEBHOOK_SECRET must start with whsec_").optional().or(z.literal("")),
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

/** Which payment providers are fully configured. */
export function billingProviders(): { payhere: boolean; stripe: boolean; payhereUsd: boolean } {
  const e = env();
  const payhere = Boolean(e.PAYHERE_MERCHANT_ID && e.PAYHERE_MERCHANT_SECRET);
  return {
    payhere,
    stripe: Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET),
    // Only once PayHere has switched on USD for your merchant account (otherwise their checkout refuses it).
    payhereUsd: payhere && e.PAYHERE_USD_ENABLED === "true",
  };
}
