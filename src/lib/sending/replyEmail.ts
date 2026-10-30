// A personal reply to a customer's feedback, sent from a follow-up. Pure, unit-tested.
// Everything typed by the team or the customer is escaped; plain-text version included.
import { escapeHtml } from "../security/html.ts";

export type ReplyEmailInput = {
  businessName: string;
  subject: string;
  message: string;
  customerComment: string | null;
  showBranding: boolean;
};

export function buildReplyEmail(i: ReplyEmailInput): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const subject = i.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 150);
  const paras = i.message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const body = paras.map((p) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:22px;color:#1f2937;">${e(p).replace(/\n/g, "<br>")}</p>`).join("");
  const quote = i.customerComment
    ? `<div style="margin:22px 0 0 0;padding:12px 14px;border-left:3px solid #e5e7eb;color:#6b7280;font-size:13px;line-height:19px;">You wrote:<br>&ldquo;${e(i.customerComment.slice(0, 500)).replace(/\n/g, "<br>")}&rdquo;</div>`
    : "";
  const foot = `You're receiving this because you left feedback for ${e(i.businessName)}. Just reply to this email to answer.${i.showBranding ? " · Sent with TapTruly" : ""}`;
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f8fafc;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;"><tr><td style="padding:28px 28px 20px 28px;font-family:Arial,Helvetica,sans-serif;">` +
    body +
    quote +
    `</td></tr></table><p style="max-width:560px;margin:14px auto 0 auto;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">${foot}</p>` +
    `</td></tr></table></body></html>`;
  const text =
    paras.join("\n\n") +
    (i.customerComment ? `\n\n---\nYou wrote:\n"${i.customerComment.slice(0, 500)}"` : "") +
    `\n\nYou're receiving this because you left feedback for ${i.businessName}. Just reply to this email to answer.`;
  return { subject, html, text };
}
