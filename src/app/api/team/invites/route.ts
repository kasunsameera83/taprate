import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { inviteCreateSchema, type InviteCreateInput } from "@/lib/validation/schemas";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/security/html";
import { ROLE_LABEL } from "@/lib/security/authz";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export const POST = secureRoute<undefined, undefined, InviteCreateInput>(
  { auth: "user", action: "team:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.invitesPerUser, body: inviteCreateSchema, maxBodyBytes: 1024 },
  async ({ supabase, membership, user, body, ipHash }) => {
    // Role rules (who may invite whom) are enforced inside the database function.
    const { data, error } = await supabase.rpc("create_invite", {
      p_account: membership.accountId,
      p_email: body.email,
      p_role: body.role,
      p_agent_name: body.role === "agent" ? (body.agentName ?? null) : null,
    });
    if (error) throw dbError(error);
    const inviteId = data as string;

    const joinUrl = `${env().appOrigin}/welcome`;
    const html = `
      <p>${escapeHtml(user.email ?? "A teammate")} invited you to join <strong>${escapeHtml(membership.accountName)}</strong> on TapTruly as ${escapeHtml(
        ROLE_LABEL[body.role],
      )}.</p>
      <p>Sign in or create an account with this email address (${escapeHtml(body.email)}), then accept the invite.</p>
      <p><a href="${escapeHtml(joinUrl)}">Open TapTruly</a></p>
      <p style="color:#475569;font-size:13px">The invite expires in 7 days. If you weren't expecting it, you can ignore this email.</p>`;
    const sent = await sendEmail({ to: body.email, subject: `Join ${membership.accountName} on TapTruly`, html });

    await audit({
      accountId: membership.accountId,
      userId: user.id,
      action: "team.invite",
      targetType: "invite",
      targetId: inviteId,
      metadata: { role: body.role, emailSent: sent === "sent" },
      ipHash,
    });
    return ok({ inviteId, emailSent: sent === "sent", joinUrl }, 201);
  },
);
