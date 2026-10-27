import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";

// Step 1 of turning on two-factor: creates an unverified authenticator and returns its QR code.
export const POST = secureRoute<undefined, undefined, undefined, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite },
  async ({ supabase, requestId }) => {
    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) return fail("unavailable", undefined, undefined, requestId);
    if (factors?.totp?.some((f) => f.status === "verified")) {
      return fail("conflict", "Two-factor sign-in is already on.", undefined, requestId);
    }
    // Remove abandoned, never-verified attempts so they can't pile up.
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) {
      console.error("[mfa] enroll failed", { code: error?.code });
      return fail("unavailable", undefined, undefined, requestId);
    }
    // Only pass through a QR code that is an SVG data URL (rendered in an <img>, never as HTML).
    const qr = data.totp.qr_code;
    if (typeof qr !== "string" || !qr.startsWith("data:image/svg+xml")) return fail("unavailable", undefined, undefined, requestId);
    return ok({ factorId: data.id, qrCode: qr, secret: data.totp.secret });
  },
);
