// The weekly "wins" email to an agent. Pure, unit-tested. Everything is escaped; inline styles only.
import { escapeHtml } from "../security/html.ts";

export const WINS_UNSUB_PURPOSE = "wins-unsub";

export type WinsEmailInput = {
  agentName: string;
  businessName: string;
  periodLabel: string;
  total: number;
  positive: number;
  satisfactionPct: number | null;
  previousPct: number | null;
  kindWords: string[]; // happy customers' comments about this agent, newest first
  appOrigin: string;
  unsubscribeUrl: string;
};

export function buildWinsEmail(i: WinsEmailInput): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const first = i.agentName.trim().split(/\s+/)[0] || i.agentName;
  const subject = `Your week at ${i.businessName}: ${i.positive} happy ${i.positive === 1 ? "customer" : "customers"}`.replace(/[\r\n]+/g, " ").slice(0, 150);
  const change =
    i.satisfactionPct !== null && i.previousPct !== null && i.satisfactionPct !== i.previousPct
      ? `${i.satisfactionPct > i.previousPct ? "up" : "down"} ${Math.abs(Math.round((i.satisfactionPct - i.previousPct) * 10) / 10)} points on the week before`
      : null;
  const words = i.kindWords.slice(0, 3);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>${e(subject)}</title></head><body style="margin:0;padding:0;background:#f8fafc;">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">` +
    `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">` +
    `<p style="margin:0 0 4px 0;font-size:13px;color:#475569;">${e(i.businessName)} · ${e(i.periodLabel)}</p>` +
    `<h1 style="margin:0 0 16px 0;font-size:22px;">Nice work this week, ${e(first)}</h1>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
    `<td style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;width:50%;"><div style="font-size:12px;color:#475569;">Happy customers</div><div style="font-size:28px;font-weight:bold;color:#15803d;">${i.positive}</div><div style="font-size:12px;color:#475569;">of ${i.total} ratings</div></td>` +
    `<td style="width:12px;"></td>` +
    `<td style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;width:50%;"><div style="font-size:12px;color:#475569;">Satisfaction</div><div style="font-size:28px;font-weight:bold;">${i.satisfactionPct === null ? "–" : `${i.satisfactionPct}%`}</div><div style="font-size:12px;color:#475569;">${change ? e(change) : "&nbsp;"}</div></td>` +
    `</tr></table>` +
    (words.length
      ? `<h2 style="font-size:16px;margin:22px 0 8px 0;">What customers said</h2>` +
        words.map((w) => `<div style="border-left:3px solid #16a34a;background:#e8f6ee;padding:8px 12px;margin:8px 0;white-space:pre-line;">&ldquo;${e(w.slice(0, 400))}&rdquo;</div>`).join("")
      : "") +
    `<p style="margin:22px 0 0 0;"><a href="${e(i.appOrigin)}/app/responses" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:8px;">See all your ratings</a></p>` +
    `</div>` +
    `<p style="font-size:12px;color:#64748b;text-align:center;margin:14px 0 0 0;">Sent by TapTruly for ${e(i.businessName)}. <a href="${e(i.unsubscribeUrl)}" style="color:#475569;">Stop these weekly emails</a></p>` +
    `</div></body></html>`;
  const text =
    `Nice work this week, ${first}\n${i.businessName} · ${i.periodLabel}\n\n` +
    `Happy customers: ${i.positive} of ${i.total} ratings\nSatisfaction: ${i.satisfactionPct === null ? "–" : `${i.satisfactionPct}%`}${change ? ` (${change})` : ""}\n\n` +
    (words.length ? `What customers said:\n${words.map((w) => `“${w.slice(0, 400)}”`).join("\n")}\n\n` : "") +
    `See all your ratings: ${i.appOrigin}/app/responses\nStop these weekly emails: ${i.unsubscribeUrl}\n`;
  return { subject, html, text };
}
