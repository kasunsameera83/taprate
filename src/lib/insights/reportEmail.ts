// The weekly / monthly email report. Pure, unit-tested. Every value from the database or the AI is
// escaped; the email has no images or scripts, and inline styles only (what email clients support).
import { escapeHtml } from "../security/html.ts";
import type { Stats } from "../surveys/stats.ts";
import type { InsightResult } from "./ai.ts";

export const UNSUB_PURPOSE = "report-unsub";

/** Local date parts in Sri Lanka time (reports go out in the morning there). */
export function colomboDate(now: number): { weekday: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", weekday: "short", day: "numeric" }).formatToParts(new Date(now));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), day: Number(parts.find((p) => p.type === "day")?.value ?? 0) };
}

/** Weekly reports go out on Mondays, monthly on the 1st; never twice for the same period. */
export function reportDue(frequency: "weekly" | "monthly", lastSentAt: string | null, now: number): boolean {
  const { weekday, day } = colomboDate(now);
  const last = lastSentAt ? Date.parse(lastSentAt) : 0;
  if (frequency === "weekly") return weekday === 1 && now - last > 5 * 86_400_000;
  return day === 1 && now - last > 20 * 86_400_000;
}

export function periodLabel(days: number, now: number): string {
  const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Colombo" });
  return `${fmt(now - days * 86_400_000)} – ${fmt(now - 86_400_000)}`;
}

export type ReportEmailInput = {
  businessName: string;
  surveyName: string | null;
  frequency: "weekly" | "monthly";
  periodLabel: string; // e.g. "21–27 Oct 2026"
  stats: Stats;
  negativeComments: Array<{ text: string; rating: string; agent: string | null }>;
  overdueFollowups: number;
  insight: InsightResult | null;
  appOrigin: string;
  unsubscribeUrl: string;
};

const pct = (v: number | null) => (v === null ? "–" : `${v}%`);

function delta(cur: number | null, prev: number | null): string {
  if (cur === null || prev === null) return "";
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return "no change";
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} pts`;
}

export function buildReportEmail(r: ReportEmailInput): { subject: string; html: string } {
  const s = r.stats;
  const e = escapeHtml;
  const scope = r.surveyName ? ` · ${e(r.surveyName)}` : "";
  const subject = `${r.frequency === "weekly" ? "Weekly" : "Monthly"} feedback report: ${r.businessName}${s.satisfactionPct !== null ? ` (${s.satisfactionPct}% satisfied)` : ""}`;
  const row = (label: string, value: string, color = "#151a2d") =>
    `<td style="padding:12px;border:1px solid #e1e4eb;border-radius:8px;width:25%"><div style="font-size:12px;color:#586074">${label}</div><div style="font-size:22px;font-weight:700;color:${color}">${value}</div></td>`;
  const list = (items: string[]) => (items.length ? `<ul style="margin:6px 0 0;padding-left:18px">${items.map((i) => `<li style="margin:2px 0">${i}</li>`).join("")}</ul>` : "");

  const ai = r.insight
    ? `<h2 style="font-size:16px;margin:24px 0 6px">AI summary</h2>
       <p style="margin:0;font-weight:600">${e(r.insight.headline)}</p>
       <p style="margin:6px 0 0;color:#374151">${e(r.insight.summary)}</p>
       ${list(r.insight.actions.map((a) => e(a)))}`
    : "";

  const neg = r.negativeComments.length
    ? `<h2 style="font-size:16px;margin:24px 0 6px">Customers who weren't happy</h2>
       ${r.negativeComments
         .map(
           (c) =>
             `<div style="border-left:3px solid #dc2626;padding:6px 10px;margin:8px 0;background:#fdecec"><div style="font-size:12px;color:#586074">${e(c.rating)}${c.agent ? ` · ${e(c.agent)}` : ""}</div><div style="white-space:pre-line">${e(c.text)}</div></div>`,
         )
         .join("")}`
    : "";

  const reasons =
    s.drivers.negative.length || s.drivers.positive.length
      ? `<h2 style="font-size:16px;margin:24px 0 6px">Top reasons</h2>
         ${s.drivers.positive.length ? `<p style="margin:0"><strong>Went well:</strong> ${s.drivers.positive.slice(0, 5).map((d) => `${e(d.label)} (${d.count})`).join(", ")}</p>` : ""}
         ${s.drivers.negative.length ? `<p style="margin:4px 0 0"><strong>Could be better:</strong> ${s.drivers.negative.slice(0, 5).map((d) => `${e(d.label)} (${d.count})`).join(", ")}</p>` : ""}`
      : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#151a2d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;padding:24px">
<tr><td>
  <div style="font-size:13px;color:#586074">TapRate · ${e(r.businessName)}${scope}</div>
  <h1 style="font-size:22px;margin:4px 0 2px">Your ${r.frequency === "weekly" ? "weekly" : "monthly"} feedback report</h1>
  <div style="font-size:13px;color:#586074">${e(r.periodLabel)}</div>
  ${
    s.total === 0
      ? `<p style="margin:20px 0 0">No ratings in this period. Make sure your rating buttons are in your emails, signature or helpdesk replies.</p>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-top:16px"><tr>
          ${row("Satisfied", pct(s.satisfactionPct), "#2f3bf5")}
          ${row("Ratings", String(s.total))}
          ${row("Unhappy", String(s.negative), s.negative ? "#b91c1c" : "#151a2d")}
          ${row("Follow-ups overdue", String(r.overdueFollowups), r.overdueFollowups ? "#b91c1c" : "#151a2d")}
        </tr></table>
        <p style="margin:8px 0 0;font-size:13px;color:#586074">Compared with the period before: ${e(delta(s.satisfactionPct, s.previous.satisfactionPct) || "no earlier data")}${s.nps ? ` · NPS ${s.nps.score}` : ""}</p>`
  }
  ${ai}
  ${reasons}
  ${neg}
  <p style="margin:28px 0 0"><a href="${e(r.appOrigin)}/app" style="background:#2f3bf5;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;display:inline-block">Open your dashboard</a></p>
  <p style="margin:24px 0 0;font-size:12px;color:#6b7385">You get this because you asked for ${r.frequency} reports in TapRate. <a href="${e(r.unsubscribeUrl)}" style="color:#6b7385">Stop these emails</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}
