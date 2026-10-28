// Spotting a sharp drop in satisfaction (whole business or one branch). Pure, unit-tested.
import { escapeHtml } from "../security/html.ts";

export const DROP_MIN_RATINGS = 20; // per week, so a few unlucky ratings don't set it off
export const DROP_POINTS = 10;

export type DropRow = { createdAt: string; positive: boolean; locationId: string | null };
export type Drop = { scope: string; name: string; currentPct: number; previousPct: number; current: number; previous: number };

const pct = (rows: DropRow[]) => Math.round((rows.filter((r) => r.positive).length / rows.length) * 1000) / 10;

/** Compares the last 7 days with the 7 before, for the business and each branch. */
export function detectDrops(rows: DropRow[], branches: Map<string, string>, now: number): Drop[] {
  const weekAgo = now - 7 * 86_400_000;
  const twoWeeks = now - 14 * 86_400_000;
  const scopes: Array<[string, string, (r: DropRow) => boolean]> = [["all", "your business", () => true], ...[...branches].map(([id, name]): [string, string, (r: DropRow) => boolean] => [id, name, (r) => r.locationId === id])];
  const out: Drop[] = [];
  for (const [scope, name, match] of scopes) {
    const mine = rows.filter(match);
    const cur = mine.filter((r) => Date.parse(r.createdAt) >= weekAgo);
    const prev = mine.filter((r) => Date.parse(r.createdAt) >= twoWeeks && Date.parse(r.createdAt) < weekAgo);
    if (cur.length < DROP_MIN_RATINGS || prev.length < DROP_MIN_RATINGS) continue;
    const c = pct(cur);
    const p = pct(prev);
    if (p - c >= DROP_POINTS) out.push({ scope, name, currentPct: c, previousPct: p, current: cur.length, previous: prev.length });
  }
  return out;
}

export function buildDropEmail(businessName: string, drops: Drop[], appOrigin: string): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const first = drops[0]!;
  const subject = `Satisfaction dropped ${Math.round(first.previousPct - first.currentPct)} points${first.scope === "all" ? "" : ` at ${first.name}`} this week`.replace(/[\r\n]+/g, " ").slice(0, 150);
  const rows = drops
    .map((d) => `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${e(d.scope === "all" ? "Whole business" : d.name)}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;"><strong>${d.currentPct}%</strong> <span style="color:#475569;">(was ${d.previousPct}%)</span></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c;">▼ ${Math.round((d.previousPct - d.currentPct) * 10) / 10} pts</td></tr>`)
    .join("");
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>${e(subject)}</title></head><body style="margin:0;background:#f8fafc;">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">` +
    `<p style="margin:0 0 4px 0;font-size:13px;color:#475569;">${e(businessName)}</p><h1 style="margin:0 0 12px 0;font-size:20px;">Customers are less happy this week</h1>` +
    `<p style="margin:0 0 12px 0;font-size:14px;color:#374151;">Compared with the week before:</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${rows}</table>` +
    `<p style="margin:18px 0 0 0;"><a href="${e(appOrigin)}/app/responses?sentiment=negative" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:8px;">See what customers said</a></p>` +
    `</div><p style="font-size:12px;color:#64748b;text-align:center;margin:14px 0 0 0;">You get this because you're an owner or admin. An owner can switch drop alerts off in Settings → Business.</p></div></body></html>`;
  const text =
    `${businessName}: customers are less happy this week.\n\n` +
    drops.map((d) => `${d.scope === "all" ? "Whole business" : d.name}: ${d.currentPct}% (was ${d.previousPct}%)`).join("\n") +
    `\n\nSee what customers said: ${appOrigin}/app/responses?sentiment=negative\n`;
  return { subject, html, text };
}
