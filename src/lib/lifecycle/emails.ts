// Welcome emails for new businesses: which one is due, and what it says. Pure and unit-tested; the
// hourly /api/cron/lifecycle job does the sending. Each kind goes to a business at most once (0044).
import { escapeHtml } from "../security/html.ts";

export type LifecycleKind = "setup" | "first_rating" | "week1";
export const TIPS_UNSUB_PURPOSE = "tips-unsub";

export type Candidate = {
  createdAt: string;
  surveys: number;
  ratings: number;
  sent: readonly string[];
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** The one email due now for a business, or null. At most one per run, so nobody gets two at once. */
export function pickLifecycleEmail(c: Candidate, now = Date.now()): LifecycleKind | null {
  const age = now - Date.parse(c.createdAt);
  if (!Number.isFinite(age) || age < 0) return null;
  const sent = new Set(c.sent);
  if (c.ratings >= 1 && !sent.has("first_rating") && age <= 30 * DAY) return "first_rating";
  if (c.surveys === 0 && c.ratings === 0 && !sent.has("setup") && age >= 20 * HOUR && age <= 7 * DAY) return "setup";
  if (!sent.has("week1") && age >= 7 * DAY && age <= 10 * DAY) return "week1";
  return null;
}

export type LifecycleEmailInput = {
  businessName: string;
  ratings7d: number;
  happy7d: number;
  unhappy7d: number;
  /** On the free plan: suggest the cheapest plan, e.g. { name: "Small shop", price: "Rs 1,990", responses: 150 }. */
  offer: { name: string; price: string; responses: number } | null;
  appOrigin: string;
  unsubscribeUrl: string;
};

export function buildLifecycleEmail(kind: LifecycleKind, i: LifecycleEmailInput): { subject: string; html: string; text: string } {
  const name = i.businessName.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80) || "your business";
  let subject: string;
  let title: string;
  let lines: string[];
  let button: { label: string; path: string };

  if (kind === "setup") {
    subject = "Your first rating is 2 minutes away";
    title = "Let’s get your first rating";
    lines = [
      `You’ve set up ${name} on TapTruly. The next step takes about 2 minutes.`,
      "Pick where you talk to customers (counter, WhatsApp, email or website) and we’ll make your survey and a printable QR poster.",
      "Put the poster on your counter or send the link after a visit, and the ratings start coming in.",
    ];
    button = { label: "Create my first survey", path: "/app/welcome" };
  } else if (kind === "first_rating") {
    subject = `Your first customer just rated ${name}`;
    title = "🎉 Your first rating is in";
    lines = [
      "A customer just told you how it went. That’s the start of hearing from every customer, not just the ones who complain.",
      "Have a look, and if they left a comment you can reply from TapTruly.",
    ];
    button = { label: "See the rating", path: "/app/responses" };
  } else if (i.ratings7d > 0) {
    const r = i.ratings7d;
    subject = `${name}’s first week: ${r} ${r === 1 ? "rating" : "ratings"}`;
    title = "Your first week on TapTruly";
    lines = [`In the last 7 days, ${r} ${r === 1 ? "customer" : "customers"} told you how it went: ${i.happy7d} happy, ${i.unhappy7d} unhappy.`];
    if (i.unhappy7d > 0) lines.push(`${i.unhappy7d === 1 ? "One customer" : `${i.unhappy7d} customers`} told you privately that something wasn’t right, so you heard it first and had the chance to fix it.`);
    if (i.offer) {
      lines.push(`To keep every rating coming each month, ${i.offer.name} is ${i.offer.price} a month for ${i.offer.responses.toLocaleString("en")} responses. Pay for 1 or 3 months at a time; nothing is charged automatically.`);
      button = { label: "See plans", path: "/app/settings/billing" };
    } else {
      button = { label: "See your dashboard", path: "/app" };
    }
  } else {
    subject = "Get your first ratings this week";
    title = "Your first week on TapTruly";
    lines = [
      "No ratings yet, and that’s normal in week one. Two things that work well:",
      "1. Print your QR poster and put it where customers wait or pay.",
      "2. Send your survey link on WhatsApp right after a visit or delivery.",
    ];
    button = { label: "Get my QR poster", path: "/app/surveys" };
  }

  const url = `${i.appOrigin}${button.path}`;
  const e = escapeHtml;
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f8fafc;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;"><tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;">` +
    `<p style="margin:0 0 6px 0;font-size:13px;color:#64748b;">TapTruly</p>` +
    `<h1 style="margin:0 0 14px 0;font-size:20px;line-height:26px;color:#0f172a;">${e(title)}</h1>` +
    lines.map((l) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:22px;color:#1f2937;">${e(l)}</p>`).join("") +
    `<p style="margin:10px 0 0 0;"><a href="${e(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:10px;">${e(button.label)}</a></p>` +
    `</td></tr></table><p style="max-width:560px;margin:14px auto 0 auto;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">You&rsquo;re receiving this because you own ${e(name)} on TapTruly. We send a few tips in your first week. <a href="${e(i.unsubscribeUrl)}" style="color:#6b7280;">Stop these emails</a></p>` +
    `</td></tr></table></body></html>`;
  const text = `${title}\n\n${lines.join("\n\n")}\n\n${button.label}: ${url}\n\nYou're receiving this because you own ${name} on TapTruly. Stop these emails: ${i.unsubscribeUrl}`;
  return { subject, html, text };
}
