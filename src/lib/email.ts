import "server-only";
import { env } from "@/lib/env";

export type SendResult = "sent" | "skipped" | "failed";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Shown as "<fromName> <our sending address>". Must already be made safe (see safeFromName). */
  fromName?: string;
  /** The business's own verified address (feedback@their-domain); otherwise our sending address. */
  fromAddress?: string | null;
  replyTo?: string | null;
  /** Only the headers we set ourselves (e.g. List-Unsubscribe). */
  headers?: Record<string, string>;
};

const HEADER_NAME = /^(List-Unsubscribe|List-Unsubscribe-Post|X-Entity-Ref-ID)$/;

const ADDRESS = /^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function toResend(defaultFrom: string, m: OutgoingEmail) {
  const from = m.fromAddress && ADDRESS.test(m.fromAddress) ? m.fromAddress : defaultFrom;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.headers ?? {})) {
    // Header injection guard: only known headers, single-line values.
    if (HEADER_NAME.test(k) && !/[\r\n]/.test(v)) headers[k] = v.slice(0, 900);
  }
  return {
    from: m.fromName ? `${m.fromName.replace(/[\r\n"<>]/g, " ").trim()} <${from}>` : from,
    to: [m.to],
    // Subjects are single-line.
    subject: m.subject.replace(/[\r\n]+/g, " ").slice(0, 150),
    html: m.html,
    ...(m.text ? { text: m.text } : {}),
    ...(m.replyTo && !/[\r\n<>,;]/.test(m.replyTo) ? { reply_to: m.replyTo } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

/** Sends one email through Resend. Returns "skipped" when email isn't configured. Never throws. */
export async function sendEmail(input: OutgoingEmail): Promise<SendResult> {
  const e = env();
  if (!e.RESEND_API_KEY || !e.ALERT_FROM_EMAIL) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(toResend(e.ALERT_FROM_EMAIL, input)),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/** Up to 100 emails in one request (Resend's batch endpoint). The whole batch succeeds or fails together. */
export async function sendEmailBatch(items: OutgoingEmail[]): Promise<SendResult> {
  const e = env();
  if (items.length === 0) return "sent";
  if (!e.RESEND_API_KEY || !e.ALERT_FROM_EMAIL) return "skipped";
  if (items.length > 100) throw new Error("batch too large");
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(items.map((m) => toResend(e.ALERT_FROM_EMAIL!, m))),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
