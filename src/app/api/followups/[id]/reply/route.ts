import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { followupReplySchema, uuidSchema } from "@/lib/validation/schemas";
import { adminClient } from "@/lib/supabase/server";
import { sendEmailBatch } from "@/lib/email";
import { buildReplyEmail } from "@/lib/sending/replyEmail";
import { safeFromName } from "@/lib/sending/emailTemplate";
import { planAllows, showBranding, upgradeMessage } from "@/lib/billing/features";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();
const EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;

// Email a reply to the customer behind an unhappy rating, from the follow-up. The database checks who may
// reply, the plan, the address (never one that bounced or complained) and the daily limit, and keeps the
// reply on the follow-up's history. Replies go to the survey's "Replies go to" address, or the sender.
export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof followupReplySchema>>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: followupReplySchema, maxBodyBytes: 12 * 1024 },
  async ({ supabase, membership, user, params, body, ipHash, requestId }) => {
    const { data: acctRow, error: aErr } = await supabase.from("accounts").select("name, plan, hide_branding").eq("id", membership.accountId).maybeSingle();
    if (aErr) throw dbError(aErr);
    if (!acctRow) return fail("not_found", undefined, undefined, requestId);
    if (!planAllows(acctRow.plan as string, "replies")) return fail("forbidden", upgradeMessage("replies"), undefined, requestId);

    const { data: rec, error } = await supabase.rpc("record_followup_reply", { p_response: params.id, p_subject: body.subject, p_body: body.message });
    if (error) throw dbError(error);
    const r = rec as { id: string; email: string; survey: string; comment: string | null };

    const db = adminClient();
    const [{ data: survey }, { data: dom }] = await Promise.all([
      db.from("surveys").select("reply_to").eq("id", r.survey).eq("account_id", membership.accountId).maybeSingle(),
      db.from("sending_domains").select("domain, from_local").eq("account_id", membership.accountId).eq("status", "verified").maybeSingle(),
    ]);
    const replyTo = [survey?.reply_to as string | null, user.email ?? null].find((a): a is string => typeof a === "string" && EMAIL.test(a)) ?? null;
    const fromAddress = dom && planAllows(acctRow.plan as string, "own_domain") ? `${dom.from_local}@${dom.domain}` : null;
    const mail = buildReplyEmail({
      businessName: acctRow.name as string,
      subject: body.subject,
      message: body.message,
      customerComment: r.comment,
      showBranding: showBranding(acctRow.plan as string, acctRow.hide_branding as boolean),
    });

    const result = await sendEmailBatch([{ to: r.email, subject: mail.subject, html: mail.html, text: mail.text, fromName: safeFromName(acctRow.name as string), fromAddress, replyTo }]);
    const status = result === "sent" ? "sent" : "failed";
    await db.from("followup_notes").update({ send_status: status }).eq("id", r.id).eq("account_id", membership.accountId);
    await audit({ accountId: membership.accountId, userId: user.id, action: status === "sent" ? "followup.reply_sent" : "followup.reply_failed", targetType: "response", targetId: params.id, ipHash });
    if (status !== "sent") {
      return fail("unavailable", result === "skipped" ? "Email sending isn't set up on this server yet. Your reply is saved on the follow-up." : "We couldn't send the email just now. Your reply is saved on the follow-up; try again in a minute.", undefined, requestId);
    }
    return ok({ sent: true, to: r.email });
  },
);
