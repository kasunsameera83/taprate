import "server-only";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { escapeHtml } from "@/lib/security/html";
import { ratingOption, type IconSetId } from "@/lib/surveys/iconSets";

type AlertInput = {
  accountId: string;
  responseId: string;
  survey: { id: string; name: string; icon_set: IconSetId; alert_threshold: number | null; alert_emails: string[] };
  rating: number;
  agent: string | null;
  respondentEmail: string | null;
};

/** Email the survey's alert list when a confirmed rating is at or below the alert level. */
export async function maybeSendLowRatingAlert(input: AlertInput): Promise<void> {
  const { survey, rating } = input;
  if (survey.alert_threshold === null || rating > survey.alert_threshold || survey.alert_emails.length === 0) return;

  const e = env();
  const db = adminClient();
  const log = (recipient: string, status: "sent" | "failed" | "skipped") =>
    db.from("alerts_log").insert({ account_id: input.accountId, response_id: input.responseId, channel: "email", recipient, status });

  if (!e.RESEND_API_KEY || !e.ALERT_FROM_EMAIL) {
    await Promise.all(survey.alert_emails.map((r) => log(r, "skipped")));
    return;
  }

  const label = ratingOption(survey.icon_set, rating)?.label ?? String(rating);
  // Everything that came from a customer or a merge tag is escaped before going into HTML.
  const html = `
    <p>A customer gave a low rating on <strong>${escapeHtml(survey.name)}</strong>.</p>
    <ul>
      <li>Rating: <strong>${escapeHtml(label)}</strong> (${rating})</li>
      ${input.agent ? `<li>Agent: ${escapeHtml(input.agent)}</li>` : ""}
      ${input.respondentEmail ? `<li>Customer: ${escapeHtml(input.respondentEmail)}</li>` : ""}
    </ul>
    <p><a href="${escapeHtml(e.appOrigin)}/app/responses?surveyId=${encodeURIComponent(survey.id)}">Open responses</a></p>`;

  for (const recipient of survey.alert_emails) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: e.ALERT_FROM_EMAIL,
          to: [recipient],
          subject: `Low rating: ${survey.name}`.replace(/[\r\n]+/g, " ").slice(0, 120),
          html,
        }),
        signal: AbortSignal.timeout(5000),
      });
      await log(recipient, res.ok ? "sent" : "failed");
    } catch {
      await log(recipient, "failed");
    }
  }
}
