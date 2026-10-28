import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { followupUpdateSchema, uuidSchema } from "@/lib/validation/schemas";
import { audit } from "@/lib/audit";
import { after } from "next/server";
import { sendRecoveryFor } from "@/lib/sending/recovery";

const params = z.object({ id: uuidSchema }).strict();

// Update a follow-up. Who may change what (owners/admins vs the assigned agent) is enforced in the database.
export const PATCH = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof followupUpdateSchema>>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: followupUpdateSchema, maxBodyBytes: 1024 },
  async ({ supabase, membership, user, params, body, ipHash }) => {
    const { error } = await supabase.rpc("update_followup", {
      p_response: params.id,
      p_status: body.status ?? null,
      p_assignee: body.assigneeId ?? null,
      p_due_at: body.dueAt ?? null,
      p_set_assignee: body.assigneeId !== undefined,
      p_set_due: body.dueAt !== undefined,
    });
    if (error) throw dbError(error);
    await audit({
      accountId: membership.accountId,
      userId: user.id,
      action: body.status === "resolved" ? "followup.resolved" : "followup.updated",
      targetType: "response",
      targetId: params.id,
      metadata: { status: body.status ?? null, reassigned: body.assigneeId !== undefined },
      ipHash,
    });
    // "Did we fix it?" email to the customer (if the survey wants it and they have an email address).
    if (body.status === "resolved") after(() => sendRecoveryFor(params.id, membership.accountId));
    return ok({ updated: true });
  },
);
