// Ready-made surveys, so a new business can start with one tap. Pure data + one helper; the server
// validates whatever is sent exactly as it validates a hand-made survey.
import { SURVEY_DEFAULTS, type Lang } from "../i18n/public.ts";
import { ICON_SETS } from "./iconSets.ts";

export type TemplateId = "visit" | "delivery" | "support" | "service";

export type SurveyTemplate = {
  id: TemplateId;
  title: string;
  hint: string;
  emoji: string;
  name: string;
  /** English wording; other languages use the reviewed general wording for that language. */
  question: string;
  positive: string[];
  negative: string[];
};

export const SURVEY_TEMPLATES: readonly SurveyTemplate[] = [
  {
    id: "visit",
    title: "After a visit",
    hint: "Shops, restaurants, clinics, salons",
    emoji: "🏪",
    name: "Visit feedback",
    question: "How was your visit today?",
    positive: ["Friendly staff", "Quick service", "Clean and tidy", "Good value"],
    negative: ["Long wait", "Unfriendly staff", "Not clean", "Too expensive"],
  },
  {
    id: "delivery",
    title: "After an order or delivery",
    hint: "Online shops and home delivery",
    emoji: "📦",
    name: "Order feedback",
    question: "How was your order?",
    positive: ["On time", "Well packed", "As described", "Easy to order"],
    negative: ["Late", "Damaged", "Not as described", "Hard to order"],
  },
  {
    id: "support",
    title: "After a chat or call",
    hint: "Customer support, sales, WhatsApp chats",
    emoji: "💬",
    name: "Support feedback",
    question: "How did we do?",
    positive: SURVEY_DEFAULTS.en.positive,
    negative: SURVEY_DEFAULTS.en.negative,
  },
  {
    id: "service",
    title: "After a job or appointment",
    hint: "Repairs, cleaning, classes, consultants",
    emoji: "🛠️",
    name: "Service feedback",
    question: "How happy are you with our work?",
    positive: ["Good quality", "On time", "Fair price", "Kept me informed"],
    negative: ["Poor quality", "Late", "Too expensive", "Hard to reach"],
  },
];

export const isTemplateId = (v: unknown): v is TemplateId => SURVEY_TEMPLATES.some((t) => t.id === v);
export const templateById = (id: TemplateId): SurveyTemplate => SURVEY_TEMPLATES.find((t) => t.id === id)!;

/** The wording a template uses in a language (English is template-specific; Sinhala/Tamil use the general wording). */
export function templateWording(t: SurveyTemplate, lang: Lang): { question: string; thanks: string; positive: string[]; negative: string[] } {
  if (lang === "en") return { question: t.question, thanks: SURVEY_DEFAULTS.en.thanks, positive: t.positive, negative: t.negative };
  const d = SURVEY_DEFAULTS[lang];
  return { question: d.question, thanks: d.thanks, positive: d.positive, negative: d.negative };
}

/** A complete new-survey body (5 faces) for a template; alerts go to the given email when there is one. */
export function templateSurvey(t: SurveyTemplate, lang: Lang, alertEmail: string | null) {
  const w = templateWording(t, lang);
  return {
    name: t.name,
    question: w.question,
    iconSet: "faces5" as const,
    brandColor: "#4f46e5",
    thankYouMessage: w.thanks,
    allowComment: true,
    websiteUrl: null,
    alertThreshold: alertEmail ? ICON_SETS.faces5.negativeTo : null,
    alertEmails: alertEmail ? [alertEmail] : [],
    status: "active" as const,
    driversPositive: w.positive,
    driversNegative: w.negative,
    language: lang,
    followupsEnabled: true,
    followupDueHours: 48,
  };
}

/** Where a business mostly talks to customers: decides which sharing steps to show first. */
export type Channel = "counter" | "whatsapp" | "email" | "website";
export const CHANNELS: ReadonlyArray<{ id: Channel; title: string; hint: string; emoji: string }> = [
  { id: "counter", title: "In person", hint: "Shop, counter, table or reception", emoji: "🧾" },
  { id: "whatsapp", title: "WhatsApp or SMS", hint: "Chats, orders and calls", emoji: "📱" },
  { id: "email", title: "Email", hint: "Support emails, invoices, Gmail", emoji: "✉️" },
  { id: "website", title: "My website", hint: "Contact page or order confirmation", emoji: "🌐" },
];
export const isChannel = (v: unknown): v is Channel => CHANNELS.some((c) => c.id === v);

/** Browser-only note that someone chose "Skip" on the welcome screen, so the dashboard stops sending them there. */
export const WELCOME_SKIPPED_KEY = "tt-welcome-skipped";
