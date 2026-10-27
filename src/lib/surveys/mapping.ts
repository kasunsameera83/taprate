// Converts between API (camelCase) and database (snake_case) shapes. Only listed fields are
// ever written, so a request can never set account_id, created_by, ids or timestamps.
import type { SurveyCreateInput, SurveyUpdateInput } from "../validation/schemas.ts";
import type { IconSetId } from "./iconSets.ts";

export type SurveyRow = {
  id: string;
  account_id: string;
  name: string;
  question: string;
  icon_set: IconSetId;
  brand_color: string;
  thank_you_message: string;
  allow_comment: boolean;
  website_url: string | null;
  alert_threshold: number | null;
  alert_emails: string[];
  status: "active" | "paused" | "archived";
  created_at: string;
  updated_at: string;
};

export const SURVEY_COLUMNS =
  "id, account_id, name, question, icon_set, brand_color, thank_you_message, allow_comment, website_url, alert_threshold, alert_emails, status, created_at, updated_at";

export type SurveyDto = {
  id: string;
  name: string;
  question: string;
  iconSet: IconSetId;
  brandColor: string;
  thankYouMessage: string;
  allowComment: boolean;
  websiteUrl: string | null;
  alertThreshold: number | null;
  alertEmails: string[];
  status: SurveyRow["status"];
  createdAt: string;
  updatedAt: string;
};

export function toSurveyDto(r: SurveyRow): SurveyDto {
  return {
    id: r.id,
    name: r.name,
    question: r.question,
    iconSet: r.icon_set,
    brandColor: r.brand_color,
    thankYouMessage: r.thank_you_message,
    allowComment: r.allow_comment,
    websiteUrl: r.website_url,
    alertThreshold: r.alert_threshold,
    alertEmails: r.alert_emails,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FIELD_MAP = {
  name: "name",
  question: "question",
  iconSet: "icon_set",
  brandColor: "brand_color",
  thankYouMessage: "thank_you_message",
  allowComment: "allow_comment",
  websiteUrl: "website_url",
  alertThreshold: "alert_threshold",
  alertEmails: "alert_emails",
  status: "status",
} as const;

export function toSurveyColumns(input: SurveyCreateInput | SurveyUpdateInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) out[column] = value;
  }
  return out;
}
