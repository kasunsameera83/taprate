// Converts between API (camelCase) and database (snake_case) shapes. Only listed fields are
// ever written, so a request can never set account_id, created_by, ids or timestamps.
import type { SurveyCreateInput, SurveyUpdateInput } from "../validation/schemas.ts";
import type { IconSetId } from "./iconSets.ts";
import { iconUrlMap, labelsFor } from "./customIcons.ts";
import { isLang, type Lang } from "../i18n/public.ts";

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
  drivers_positive: string[];
  drivers_negative: string[];
  review_cta_label: string | null;
  review_cta_url: string | null;
  followups_enabled: boolean;
  followup_due_hours: number;
  icon_images?: Record<string, string> | null;
  option_labels?: Record<string, string> | null;
  language?: string | null;
  reasons_question_positive?: string | null;
  reasons_question_negative?: string | null;
  created_at: string;
  updated_at: string;
};

export const SURVEY_COLUMNS =
  "id, account_id, name, question, icon_set, brand_color, thank_you_message, allow_comment, website_url, alert_threshold, alert_emails, status, drivers_positive, drivers_negative, review_cta_label, review_cta_url, followups_enabled, followup_due_hours, icon_images, option_labels, language, reasons_question_positive, reasons_question_negative, created_at, updated_at";

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
  driversPositive: string[];
  driversNegative: string[];
  reviewCtaLabel: string | null;
  reviewCtaUrl: string | null;
  followupsEnabled: boolean;
  followupDueHours: number;
  /** Public picture URLs by rating value (only scales that allow custom pictures). */
  iconImages: Record<string, string>;
  optionLabels: Record<string, string>;
  /** Language of what customers see. */
  language: Lang;
  reasonsQuestionPositive: string | null;
  reasonsQuestionNegative: string | null;
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
    driversPositive: r.drivers_positive ?? [],
    driversNegative: r.drivers_negative ?? [],
    reviewCtaLabel: r.review_cta_label,
    reviewCtaUrl: r.review_cta_url,
    followupsEnabled: r.followups_enabled,
    followupDueHours: r.followup_due_hours,
    iconImages: iconUrlMap(r.icon_set, r.icon_images),
    optionLabels: labelsFor(r.icon_set, r.option_labels),
    language: isLang(r.language) ? r.language : "en",
    reasonsQuestionPositive: r.reasons_question_positive ?? null,
    reasonsQuestionNegative: r.reasons_question_negative ?? null,
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
  driversPositive: "drivers_positive",
  driversNegative: "drivers_negative",
  reviewCtaLabel: "review_cta_label",
  reviewCtaUrl: "review_cta_url",
  followupsEnabled: "followups_enabled",
  followupDueHours: "followup_due_hours",
  optionLabels: "option_labels",
  language: "language",
  reasonsQuestionPositive: "reasons_question_positive",
  reasonsQuestionNegative: "reasons_question_negative",
} as const;

export function toSurveyColumns(input: SurveyCreateInput | SurveyUpdateInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) out[column] = value;
  }
  return out;
}
