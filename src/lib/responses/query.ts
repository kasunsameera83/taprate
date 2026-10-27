import "server-only";

export const RESPONSE_COLUMNS =
  "id, survey_id, rating, pending_rating, status, comment, respondent_email, agent, ticket_ref, metadata_verified, sentiment, created_at, confirmed_at, surveys(name, icon_set)";

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
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
  };
}
