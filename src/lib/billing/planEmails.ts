// Emails for prepaid plans: "your plan ends soon" and "your plan has ended". Pure and unit-tested.
import { escapeHtml } from "../security/html.ts";

/** Days before the end of a prepaid plan that we remind the owner. */
export const RENEW_REMINDER_DAYS = 5;

export function fmtColomboDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Colombo" });
}

export function buildPlanEmail(i: { kind: "ending" | "ended"; businessName: string; planName: string; endsAt: string; appOrigin: string }): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const name = i.businessName.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "your business";
  const plan = i.planName.replace(/[\r\n]+/g, " ").trim().slice(0, 30);
  const date = fmtColomboDate(i.endsAt);
  const url = `${i.appOrigin.replace(/\/+$/, "")}/app/settings/billing`;
  const ending = i.kind === "ending";
  const subject = ending ? `Your TapTruly ${plan} plan ends on ${date}` : `Your TapTruly ${plan} plan has ended`;
  const heading = ending ? `Your ${plan} plan ends on ${date}` : `Your ${plan} plan has ended`;
  const lead = ending
    ? `The ${plan} plan for ${name} was paid up to ${date}. Plans don't renew by themselves, so renew before then to keep your monthly responses and paid features.`
    : `The ${plan} plan for ${name} ended on ${date}, so the business is now on the free plan. Your surveys, ratings and the responses you have left are all kept.`;
  const ask = ending ? "Renewing adds the new month on to the end of your current one, so you lose nothing by renewing early." : "Renew any time to get your monthly responses, AI insights, TV screen, reports and more back.";
  const button = ending ? "Renew my plan" : "Choose a plan";
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f8fafc;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;"><tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;">` +
    `<p style="margin:0 0 6px 0;font-size:13px;color:#64748b;">TapTruly</p>` +
    `<h1 style="margin:0 0 14px 0;font-size:20px;line-height:26px;color:#0f172a;">${e(heading)}</h1>` +
    `<p style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#1f2937;">${e(lead)}</p>` +
    `<p style="margin:0 0 22px 0;font-size:15px;line-height:22px;color:#1f2937;">${e(ask)}</p>` +
    `<a href="${e(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:10px;">${e(button)}</a>` +
    `</td></tr></table><p style="max-width:560px;margin:14px auto 0 auto;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">You&rsquo;re receiving this because you own ${e(name)} on TapTruly.</p>` +
    `</td></tr></table></body></html>`;
  const text = `${heading}\n\n${lead}\n\n${ask}\n\n${button}: ${url}\n\nYou're receiving this because you own ${name} on TapTruly.`;
  return { subject, html, text };
}
