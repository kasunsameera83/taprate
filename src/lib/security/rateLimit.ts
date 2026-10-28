import "server-only";
import { adminClient } from "@/lib/supabase/server";

export type RateLimitRule = { name: string; limit: number; windowSec: number };

// Central list so limits are easy to review in one place.
export const LIMITS = {
  signupPerIp: { name: "signup:ip", limit: 5, windowSec: 3600 },
  loginPerIp: { name: "login:ip", limit: 20, windowSec: 900 },
  loginPerIpEmail: { name: "login:ip-email", limit: 5, windowSec: 900 },
  clickPerIp: { name: "click:ip", limit: 60, windowSec: 60 },
  clickPerSurvey: { name: "click:survey", limit: 3000, windowSec: 60 },
  publicPerIp: { name: "public:ip", limit: 30, windowSec: 60 },
  commentPerResponse: { name: "comment:resp", limit: 10, windowSec: 3600 },
  userRead: { name: "user:read", limit: 120, windowSec: 60 },
  userWrite: { name: "user:write", limit: 30, windowSec: 60 },
  userExport: { name: "user:export", limit: 5, windowSec: 60 },
  forgotPerIp: { name: "forgot:ip", limit: 5, windowSec: 900 },
  forgotPerEmail: { name: "forgot:email", limit: 3, windowSec: 3600 },
  reauth: { name: "reauth:user", limit: 5, windowSec: 900 },
  mfaVerify: { name: "mfa:user", limit: 6, windowSec: 300 },
  invitesPerUser: { name: "invite:user", limit: 30, windowSec: 3600 },
  dangerous: { name: "danger:user", limit: 5, windowSec: 3600 },
  upload: { name: "upload:user", limit: 10, windowSec: 3600 },
  cron: { name: "cron:ip", limit: 10, windowSec: 60 },
  kioskPerIp: { name: "kiosk:ip", limit: 60, windowSec: 60 },
  kioskBurst: { name: "kiosk:burst", limit: 1, windowSec: 2 },
  kioskDaily: { name: "kiosk:day", limit: 2000, windowSec: 86400 },
  integrationTest: { name: "integration:test", limit: 10, windowSec: 600 },
  apiPerIp: { name: "api:ip", limit: 600, windowSec: 60 },
  apiBadKeyPerIp: { name: "api:badkey", limit: 20, windowSec: 600 },
  apiRead: { name: "api:read", limit: 120, windowSec: 60 },
  apiWrite: { name: "api:write", limit: 60, windowSec: 60 },
  apiKeysPerUser: { name: "apikey:user", limit: 10, windowSec: 3600 },
  importPerUser: { name: "import:user", limit: 10, windowSec: 3600 },
  checkoutPerUser: { name: "checkout:user", limit: 10, windowSec: 600 },
  // Trying promo codes: low enough that guessing codes is pointless.
  promoPerAccount: { name: "promo:account", limit: 10, windowSec: 3600 },
  webhookPerIp: { name: "webhook:ip", limit: 300, windowSec: 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Returns true if allowed. Fails CLOSED: if the limiter itself is unavailable we refuse the
 * request rather than run without protection.
 */
export async function hitRateLimit(rule: RateLimitRule, subject: string): Promise<boolean> {
  const key = `${rule.name}:${subject}`.slice(0, 200);
  const { data, error } = await adminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSec,
  });
  if (error) {
    console.error("[rate-limit] limiter unavailable", { rule: rule.name, code: error.code });
    return false;
  }
  return data === true;
}
