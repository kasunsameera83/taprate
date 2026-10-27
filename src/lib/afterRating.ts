import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { maybeSendLowRatingAlert } from "@/lib/alerts";
import { dispatchRating } from "@/lib/integrations";
import { isIconSetId } from "@/lib/surveys/iconSets";

/** Everything that happens after a rating is confirmed: low-rating email alerts and integrations. Never throws. */
export async function notifyRating(responseId: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: r } = await db
      .from("responses")
      .select("id, account_id, survey_id, rating, agent, respondent_email")
      .eq("id", responseId)
      .eq("status", "confirmed")
      .maybeSingle();
    if (!r || r.rating === null) return;
    const { data: survey } = await db
      .from("surveys")
      .select("id, name, icon_set, alert_threshold, alert_emails")
      .eq("id", r.survey_id)
      .eq("account_id", r.account_id)
      .maybeSingle();
    await Promise.allSettled([
      survey && isIconSetId(survey.icon_set)
        ? maybeSendLowRatingAlert({
            accountId: r.account_id,
            responseId: r.id,
            survey: { ...survey, icon_set: survey.icon_set },
            rating: r.rating,
            agent: r.agent,
            respondentEmail: r.respondent_email,
          })
        : Promise.resolve(),
      dispatchRating(r.id),
    ]);
  } catch (err) {
    console.error("[after-rating] failed", { err });
  }
}
