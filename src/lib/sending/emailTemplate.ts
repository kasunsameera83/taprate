// The survey email TapTruly sends for a business. Pure, unit-tested.
// Everything the business or the customer typed is escaped; the buttons come from the same builder
// as the copy-paste snippet. Inline styles only, no scripts, a plain-text version for every email.
import { escapeHtml } from "../security/html.ts";
import { pt, type Lang } from "../i18n/public.ts";

export type SurveyEmailInput = {
  businessName: string;
  logoUrl: string | null;
  subject: string;
  intro: string; // may contain {name} and {business}
  recipientName: string | null;
  buttonsHtml: string; // built by buildSnippetHtml with every value escaped
  buttonLinks: Array<{ label: string; url: string }>; // for the plain-text version
  unsubscribeUrl: string;
  reminder: boolean;
  lang?: Lang;
};

/** "{name}" → the customer's first name (or "there"); "{business}" → the business name. */
export function fillPlaceholders(text: string, name: string | null, business: string): string {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  return text.replace(/\{name\}/gi, first || "there").replace(/\{business\}/gi, business);
}

/** A display name that is safe inside an email From header: no quotes, angle brackets or line breaks. */
export function safeFromName(name: string): string {
  const cleaned = name.replace(/[\r\n"<>\\;,:@]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return cleaned || "TapTruly";
}

const LOGO_RE = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/storage\/v1\/object\/public\/logos\/accounts\/[0-9a-f-]{36}\/logo-[A-Za-z0-9_-]{8,40}\.(png|jpg|webp)$/;

export function buildSurveyEmail(i: SurveyEmailInput): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const L = i.lang ?? "en";
  const subject = (i.reminder ? `${pt(L, "reminderPrefix")} ${i.subject}` : i.subject).replace(/[\r\n]+/g, " ").slice(0, 150);
  const intro = fillPlaceholders(i.intro, i.recipientName, i.businessName);
  const paragraphs = intro
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:22px;color:#1f2937;">${e(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const logo = i.logoUrl && LOGO_RE.test(i.logoUrl) ? `<img src="${e(i.logoUrl)}" alt="${e(i.businessName)}" height="40" style="display:block;height:40px;width:auto;border:0;margin:0 0 20px 0;">` : `<p style="margin:0 0 20px 0;font-size:17px;font-weight:bold;color:#111827;">${e(i.businessName)}</p>`;

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f8fafc;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="background:#f8fafc;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;"><tr><td style="padding:28px 28px 20px 28px;font-family:Arial,Helvetica,sans-serif;">` +
    logo +
    (i.reminder ? `<p style="margin:0 0 14px 0;font-size:13px;color:#475569;">${e(pt(L, "reminderNote"))}</p>` : "") +
    paragraphs +
    i.buttonsHtml +
    `<p style="margin:16px 0 0 0;font-size:13px;line-height:19px;color:#475569;">${e(pt(L, "tapThatFits"))}</p>` +
    `</td></tr></table>` +
    `<p style="max-width:560px;margin:14px auto 0 auto;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#64748b;text-align:center;">` +
    `${e(pt(L, "sentBy", { business: i.businessName }))} <a href="${e(i.unsubscribeUrl)}" style="color:#475569;text-decoration:underline;">${e(pt(L, "stopEmails", { business: i.businessName }))}</a></p>` +
    `</td></tr></table></body></html>`;

  const text =
    `${i.reminder ? `${pt(L, "reminderNote")}\n\n` : ""}${intro}\n\n` +
    i.buttonLinks.map((b) => `${b.label}: ${b.url}`).join("\n") +
    `\n\n${pt(L, "sentBy", { business: i.businessName })}\n${pt(L, "stopEmails", { business: i.businessName })}: ${i.unsubscribeUrl}\n`;

  return { subject, html, text };
}

export const DEFAULT_INTRO = "Hi {name},\n\nThanks for choosing {business}. We'd love to know how we did. It takes one tap.";
