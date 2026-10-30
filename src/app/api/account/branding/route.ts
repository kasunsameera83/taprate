import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { aiSettingSchema } from "@/lib/validation/schemas";
import { planAllows, upgradeMessage } from "@/lib/billing/features";
import { audit } from "@/lib/audit";

// Hide "Feedback by TapTruly" on survey pages, the website widget, reply emails and share cards.
// Growth and Scale plans; owner only (checked here, by row rules and by a database trigger).
export const GET = secureRoute(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data, error } = await supabase.from("accounts").select("hide_branding, plan").eq("id", membership.accountId).maybeSingle();
    if (error) throw dbError(error);
    return ok({ hidden: Boolean(data?.hide_branding), allowed: planAllows(data?.plan as string | undefined, "white_label") });
  },
);

export const PATCH = secureRoute<undefined, undefined, z.infer<typeof aiSettingSchema>>(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: aiSettingSchema, maxBodyBytes: 128 },
  async ({ supabase, membership, user, body, ipHash, requestId }) => {
    const { data: acct } = await supabase.from("accounts").select("plan").eq("id", membership.accountId).maybeSingle();
    if (body.enabled && !planAllows(acct?.plan as string | undefined, "white_label")) return fail("forbidden", upgradeMessage("white_label"), undefined, requestId);
    const { error } = await supabase.from("accounts").update({ hide_branding: body.enabled }).eq("id", membership.accountId);
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: body.enabled ? "branding.hidden" : "branding.shown", ipHash });
    return ok({ hidden: body.enabled });
  },
);
