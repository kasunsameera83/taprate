import { z } from "zod";
import { apiRoute } from "@/lib/security/apiRoute";
import { ok, fail, dbError } from "@/lib/security/route";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { apiSendSchema, type ApiSendInput } from "@/lib/validation/sending";
import { processQueue } from "@/lib/sending/server";

const params = z.object({ id: uuidSchema }).strict();
export const dynamic = "force-dynamic";

// POST /api/v1/surveys/{id}/send — TapRate emails this survey to ONE customer now. Use it from Zapier,
// Make, Shopify Flow or your helpdesk when an order is delivered or a ticket is solved.
// Unsubscribes, bounces, the "recently emailed" rule (30 days unless skip_recent_days says otherwise),
// and your daily limit all apply. The same address twice on the same day gets one email.
export const POST = apiRoute<z.infer<typeof params>, undefined, ApiSendInput>(
  { scope: "write", params, body: apiSendSchema, maxBodyBytes: 2048 },
  async ({ db, key, params, body, requestId }) => {
    if (!(await hitRateLimit(LIMITS.apiSend, key.id))) return fail("rate_limited", undefined, undefined, requestId);
    const row = { email: body.email, ...(body.name ? { name: body.name } : {}), ...(body.agent ? { agent: body.agent } : {}), ...(body.ticket ? { ticket: body.ticket } : {}) };
    // The function checks the survey belongs to the key's business before doing anything.
    const { data, error } = await db.rpc("api_send_one", { p_account: key.accountId, p_survey: params.id, p_row: row, p_skip_recent_days: body.skip_recent_days ?? 30 });
    if (error) {
      if (/not found/.test(error.message ?? "")) return fail("not_found", undefined, undefined, requestId);
      throw dbError(error);
    }
    const r = data as { recipient: string; status: string };
    let status = r.status;
    if (status === "queued") {
      const { data: rec } = await db.from("send_recipients").select("send_id").eq("id", r.recipient).eq("account_id", key.accountId).maybeSingle();
      if (rec) {
        const p = await processQueue(db, { sendId: rec.send_id, budgetMs: 8_000 });
        const { data: after } = await db.from("send_recipients").select("status").eq("id", r.recipient).eq("account_id", key.accountId).maybeSingle();
        status = after?.status ?? status;
        if (p.notConfigured) status = "queued";
      }
    }
    const MEANING: Record<string, string> = {
      sent: "Email sent.",
      queued: "Queued; it will go out shortly.",
      sending: "Being sent now.",
      failed: "The email provider refused this email.",
      suppressed: "Not sent: this person unsubscribed, or their address bounced.",
      skipped_recent: "Not sent: this person was emailed by your business recently.",
      duplicate: "Not sent again: this person already got this survey today.",
    };
    return ok({ recipient_id: r.recipient, status, message: MEANING[status] ?? status }, status === "duplicate" ? 200 : 201);
  },
);
