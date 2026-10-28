import "server-only";
import { isIconSetId, ICON_SETS, ratingOption } from "@/lib/surveys/iconSets";

// Public API shapes (snake_case, stable). Only fields we're happy for integrators to depend on.

export const API_RESPONSE_COLUMNS =
  "id, survey_id, rating, sentiment, comment, respondent_email, agent, ticket_ref, metadata_verified, drivers, channel, followup_status, created_at, confirmed_at, location_id, surveys(name, icon_set), locations(name)";

type Row = {
  id: string;
  survey_id: string;
  rating: number | null;
  sentiment: string | null;
  comment: string | null;
  respondent_email: string | null;
  agent: string | null;
  ticket_ref: string | null;
  metadata_verified: boolean;
  drivers: string[] | null;
  channel: string;
  followup_status: string | null;
  created_at: string;
  confirmed_at: string | null;
  surveys: { name: string; icon_set: string } | null;
  location_id?: string | null;
  locations?: { name: string } | null;
};

export function toApiResponse(r: Row) {
  const set = r.surveys && isIconSetId(r.surveys.icon_set) ? r.surveys.icon_set : null;
  return {
    id: r.id,
    survey: { id: r.survey_id, name: r.surveys?.name ?? null },
    rating: {
      value: r.rating,
      label: set && r.rating !== null ? (ratingOption(set, r.rating)?.label ?? null) : null,
      sentiment: r.sentiment,
    },
    comment: r.comment,
    reasons: r.drivers ?? [],
    customer: { email: r.respondent_email },
    agent: r.agent,
    ticket: r.ticket_ref,
    // true only when the recipient details came from a link signed by TapRate (e.g. made with this API).
    verified: r.metadata_verified,
    channel: r.channel,
    location: r.location_id ? { id: r.location_id, name: r.locations?.name ?? null } : null,
    follow_up: r.followup_status,
    created_at: r.created_at,
    confirmed_at: r.confirmed_at,
  };
}

export function toApiSurvey(s: { id: string; name: string; question: string; icon_set: string; status: string; created_at: string }) {
  const set = isIconSetId(s.icon_set) ? ICON_SETS[s.icon_set] : null;
  return {
    id: s.id,
    name: s.name,
    question: s.question,
    status: s.status,
    scale: set ? { id: set.id, name: set.name, min: set.min, max: set.max, options: set.options.map((o) => ({ value: o.value, label: o.label })) } : null,
    created_at: s.created_at,
  };
}
