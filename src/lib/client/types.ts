// Shapes returned by our API (kept in one place for the client screens).
import type { SurveyDto } from "../surveys/mapping.ts";
import type { Stats } from "../surveys/stats.ts";

export type Survey = SurveyDto;

export type BranchStat = { id: string; name: string; total: number; satisfactionPct: number | null; previousPct: number | null; negative: number };

export type StatsResponse = Stats & {
  byLocation: BranchStat[];
  recovery: { sent: number; answered: number; recovered: number; ratePct: number | null };
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
  channel: string;
  location: { id: string; name: string } | null;
  testimonial: { displayName: string | null; featured: boolean; social: boolean } | null;
  followup: { status: "open" | "in_progress" | "resolved"; assigneeId: string | null; dueAt: string | null; resolvedAt: string | null } | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type Location = { id: string; name: string; archived: boolean; createdAt: string };

export type ResponsesPage = { items: ResponseItem[]; page: number; limit: number; total: number };

export type SnippetResponse = { html: string; links: Array<{ rating: number; label: string; url: string }>; active: boolean };
