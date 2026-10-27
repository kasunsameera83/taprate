import "server-only";

export const RESPONSE_COLUMNS =
  "id, survey_id, rating, pending_rating, status, comment, respondent_email, agent, ticket_ref, metadata_verified, sentiment, drivers, followup_status, assignee, due_at, resolved_at, created_at, confirmed_at, surveys(name, icon_set)";

export type ResponseRow = {
  id: string;
  survey_id: string;
  rating: number | null;
  pending_rating: number | null;
  status: "pending" | "confirmed";
  comment: string | null;
  respondent_email: string | null;
  agent: string | null;
  ticket_ref: string | null;
  metadata_verified: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
  drivers: string[] | null;
  followup_status: "open" | "in_progress" | "resolved" | null;
  assignee: string | null;
  due_at: string | null;
  resolved_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  surveys: { name: string; icon_set: string } | null;
};

export function toResponseDto(r: ResponseRow) {
  return {
    id: r.id,
    surveyId: r.survey_id,
    surveyName: r.surveys?.name ?? "",
    iconSet: r.surveys?.icon_set ?? null,
    rating: r.rating ?? r.pending_rating,
    status: r.status,
    comment: r.comment,
    email: r.respondent_email,
    agent: r.agent,
    ticket: r.ticket_ref,
    verified: r.metadata_verified,
    sentiment: r.sentiment,
    drivers: r.drivers ?? [],
    followup: r.followup_status
      ? { status: r.followup_status, assigneeId: r.assignee, dueAt: r.due_at, resolvedAt: r.resolved_at }
      : null,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
  };
}
