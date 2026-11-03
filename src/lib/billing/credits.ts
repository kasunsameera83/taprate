// How full a business's response balance is, for the sidebar, the "running low" banner and the
// running-low / out emails. Pure and unit-tested. The database is what actually stops ratings at 0.
import { escapeHtml } from "../security/html.ts";
import { isPaidPlan } from "./features.ts";
import type { Catalog } from "./catalog.ts";

/** 0 = fine, 1 = running low (about 80% used), 2 = out. */
export type CreditLevel = 0 | 1 | 2;

/** The responses a business gets per period: the plan's monthly amount, or the free plan's starting amount. */
export function allowanceFor(plan: string | null | undefined, catalog: Catalog): number {
  const p = isPaidPlan(plan) ? catalog.plans.find((x) => x.id === plan) : undefined;
  const n = p ? p.monthlyResponses : catalog.free.responses;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** "Running low" once 80% of the allowance is used (at least 5 left), "out" at 0. */
export function lowThreshold(allowance: number): number {
  return Math.max(5, Math.ceil(Math.max(1, allowance) * 0.2));
}

export function creditLevel(balance: number, allowance: number): CreditLevel {
  const b = Number.isFinite(balance) ? balance : 0;
  if (b <= 0) return 2;
  if (b <= lowThreshold(allowance)) return 1;
  return 0;
}

/** Share of the allowance still left, 0–100, for the progress bar. */
export function leftPercent(balance: number, allowance: number): number {
  if (!(allowance > 0) || !(balance > 0)) return 0;
  return Math.min(100, Math.round((balance / allowance) * 100));
}

/** "Free" for anything that isn't a paid plan (including old "trial" businesses). */
export function planLabel(plan: string | null | undefined): string {
  if (!isPaidPlan(plan)) return "Free";
  const p = String(plan);
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export type CreditsEmailInput = {
  businessName: string;
  level: 1 | 2;
  balance: number;
  paid: boolean;
  appOrigin: string;
};

/** The email to owners when a business is running low on responses or has run out. */
export function buildCreditsEmail(i: CreditsEmailInput): { subject: string; html: string; text: string } {
  const e = escapeHtml;
  const name = i.businessName.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "your business";
  const url = `${i.appOrigin.replace(/\/+$/, "")}/app/settings/billing`;
  const out = i.level === 2;
  const subject = out ? `${name} is out of responses: new ratings aren't being saved` : `${name} has ${i.balance} responses left`;
  const lead = out
    ? `${name} has used all its responses. Customers can still tap, but their ratings and comments aren't being saved until you add more.`
    : `${name} has only ${i.balance} responses left. When they run out, new ratings and comments won't be saved.`;
  const ask = i.paid
    ? "Add a top-up pack or move to a bigger plan so you don't miss any feedback."
    : "Choose a plan to keep collecting feedback every month, and unlock AI insights, the office TV screen, email reports and more.";
  const button = out ? (i.paid ? "Add responses" : "Choose a plan") : i.paid ? "See top-ups and plans" : "See plans";
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f8fafc;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;"><tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;">` +
    `<p style="margin:0 0 6px 0;font-size:13px;color:#64748b;">TapTruly</p>` +
    `<h1 style="margin:0 0 14px 0;font-size:20px;line-height:26px;color:#0f172a;">${out ? "You&rsquo;re out of responses" : "You&rsquo;re running low on responses"}</h1>` +
    `<p style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#1f2937;">${e(lead)}</p>` +
    `<p style="margin:0 0 22px 0;font-size:15px;line-height:22px;color:#1f2937;">${e(ask)}</p>` +
    `<a href="${e(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:10px;">${e(button)}</a>` +
    `</td></tr></table><p style="max-width:560px;margin:14px auto 0 auto;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">You&rsquo;re receiving this because you own ${e(name)} on TapTruly. We only send this when your balance runs low or runs out.</p>` +
    `</td></tr></table></body></html>`;
  const text = `${lead}\n\n${ask}\n\n${button}: ${url}\n\nYou're receiving this because you own ${name} on TapTruly.`;
  return { subject, html, text };
}
