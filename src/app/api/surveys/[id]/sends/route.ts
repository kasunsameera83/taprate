import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { sendCreateSchema, type SendCreateInput } from "@/lib/validation/sending";
import { adminClient } from "@/lib/supabase/server";
import { processQueue } from "@/lib/sending/server";
import { audit } from "@/lib/audit";

const params = z.object({ id: uuidSchema }).strict();

export const dynamic = "force-dynamic";
// Sending up to 1,000 emails takes a little while (batches of 100, paced for the email provider).
export const maxDuration = 60;

type SendRow = { id: string; name: string; subject: string; source: string; reminder_days: number | null; skip_recent_days: number; recipient_count: number; created_at: string; repeat_days: number | null; next_run_at: string | null };
type Summary = { send_id: string; total: number; queued: number; sent: number; failed: number; suppressed: number; skipped_recent: number; reminded: number; rated: number };

// List this survey's sends with their numbers. Owners, admins and viewers (the database hides them from agents).
export const GET = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "sends:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params },
  async ({ supabase, membership, params }) => {
    const { data, error } = await supabase
      .from("survey_sends")
      .select("id, name, subject, source, reminder_days, skip_recent_days, recipient_count, created_at, repeat_days, next_run_at")
      .eq("account_id", membership.accountId)
      .eq("survey_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw dbError(error);
    const sends = (data ?? []) as SendRow[];
    const summaries = new Map<string, Summary>();
    if (sends.length) {
      // Service role, but only for send ids the user's own (RLS-checked) query just returned, and this account.
      const { data: sums, error: sErr } = await adminClient().rpc("send_summaries", { p_account: membership.accountId, p_sends: sends.map((s) => s.id) });
      if (sErr) throw dbError(sErr);
      for (const s of (sums ?? []) as Summary[]) summaries.set(s.send_id, s);
    }
    const { data: acct } = await supabase.from("accounts").select("credit_balance").eq("id", membership.accountId).maybeSingle();
    return ok({
      credits: acct?.credit_balance ?? null,
      sends: sends.map((s) => {
        const m = summaries.get(s.id);
        return {
          id: s.id,
          name: s.name,
          subject: s.subject,
          source: s.source,
          reminderDays: s.reminder_days,
          skipRecentDays: s.skip_recent_days,
          repeatDays: s.repeat_days,
          nextRunAt: s.next_run_at,
          createdAt: s.created_at,
          total: m?.total ?? s.recipient_count,
          queued: m?.queued ?? 0,
          sent: m?.sent ?? 0,
          failed: m?.failed ?? 0,
          suppressed: m?.suppressed ?? 0,
          skippedRecent: m?.skipped_recent ?? 0,
          reminded: m?.reminded ?? 0,
          rated: m?.rated ?? 0,
        };
      }),
    });
  },
);

// Create a send and start emailing right away. The database checks the role, the survey, every
// address, unsubscribes, bounces, the "recently emailed" rule and today's limit.
export const POST = secureRoute<z.infer<typeof params>, undefined, SendCreateInput>(
  { auth: "user", action: "sends:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.sendCreate, params, body: sendCreateSchema, maxBodyBytes: 256 * 1024 },
  async ({ supabase, membership, user, params, body, ipHash, requestId }) => {
    const { data, error } = await supabase.rpc("create_survey_send", {
      p_account: membership.accountId,
      p_survey: params.id,
      p_name: body.name,
      p_subject: body.subject,
      p_intro: body.intro,
      p_reply_to: body.replyTo,
      p_reminder_days: body.reminderDays,
      p_skip_recent_days: body.skipRecentDays,
      p_recipients: body.recipients,
    });
    if (error) throw dbError(error);
    const result = data as { id: string; queued: number; suppressed: number; skipped_recent: number; not_added: number };
    if (!result?.id) return fail("internal_error", undefined, undefined, requestId);
    await audit({
      accountId: membership.accountId,
      userId: user.id,
      action: "send.created",
      targetType: "survey_send",
      targetId: result.id,
      metadata: { queued: result.queued, suppressed: result.suppressed, skipped: result.skipped_recent, over_limit: result.not_added },
      ipHash,
    });
    const progress = await processQueue(adminClient(), { sendId: result.id, budgetMs: 40_000 });
    return ok(
      {
        id: result.id,
        queued: result.queued,
        suppressed: result.suppressed,
        skippedRecent: result.skipped_recent,
        overLimit: result.not_added,
        sent: progress.sent,
        failed: progress.failed,
        remaining: progress.remaining,
        notConfigured: progress.notConfigured,
      },
      201,
    );
  },
);
