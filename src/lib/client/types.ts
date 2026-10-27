// Shapes returned by our API (kept in one place for the client screens).
import type { SurveyDto } from "../surveys/mapping.ts";
import type { Stats } from "../surveys/stats.ts";

export type Survey = SurveyDto;

export type StatsResponse = Stats & {
  pending: number;
  truncated: boolean;
  account: { name: string; plan: string; credits: number; role: "owner" | "admin" | "viewer" } | null;
};

export type ResponseItem = {
  id: string;
  surveyId: string;
  surveyName: string;
  iconSet: string | null;
  rating: number | null;
  status: "pending" | "confirmed";
  comment: string | null;
  email: string | null;
  agent: string | null;
  ticket: string | null;
  verified: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
  drivers: string[];
  followup: { status: "open" | "in_progress" | "resolved"; assigneeId: string | null; dueAt: string | null; resolvedAt: string | null } | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type ResponsesPage = { items: ResponseItem[]; page: number; limit: number; total: number };

export type SnippetResponse = { html: string; links: Array<{ rating: number; label: string; url: string }>; active: boolean };
