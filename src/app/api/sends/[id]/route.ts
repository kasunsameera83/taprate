import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

// Who was on a send and what happened to each email. Read with the user's own session (RLS applies).
export const GET = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "sends:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params },
  async ({ supabase, membership, params }) => {
    const { data: send, error } = await supabase.from("survey_sends").select("id, survey_id").eq("id", params.id).eq("account_id", membership.accountId).maybeSingle();
    if (error) throw dbError(error);
    if (!send) return fail("not_found");
    const { data: rows, error: rErr } = await supabase
      .from("send_recipients")
      .select("id, email, name, status, sent_at, reminded_at")
      .eq("send_id", params.id)
      .eq("account_id", membership.accountId)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (rErr) throw dbError(rErr);
    // Who has rated since their email (same survey, same address).
    const emails = (rows ?? []).filter((r) => r.sent_at).map((r) => r.email);
    const rated = new Set<string>();
    for (let i = 0; i < emails.length; i += 200) {
      const { data: resp } = await supabase
        .from("responses")
        .select("respondent_email")
        .eq("account_id", membership.accountId)
        .eq("survey_id", send.survey_id)
        .eq("status", "confirmed")
        .in("respondent_email", emails.slice(i, i + 200));
      for (const r of resp ?? []) if (r.respondent_email) rated.add(r.respondent_email);
    }
    return ok({
      recipients: (rows ?? []).map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        status: r.status,
        sentAt: r.sent_at,
        remindedAt: r.reminded_at,
        rated: rated.has(r.email),
      })),
    });
  },
);

// Stop a send: emails not yet sent are dropped, and no reminder goes out.
export const DELETE = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params },
  async ({ supabase, membership, user, params, ipHash }) => {
    const { data, error } = await supabase.rpc("cancel_survey_send", { p_send: params.id });
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "send.stopped", targetType: "survey_send", targetId: params.id, metadata: { dropped: Number(data ?? 0) }, ipHash });
    return ok({ dropped: Number(data ?? 0) });
  },
);
