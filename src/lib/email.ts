import "server-only";
import { env } from "@/lib/env";

export type SendResult = "sent" | "skipped" | "failed";

/** Sends one email through Resend. Returns "skipped" when email isn't configured. Never throws. */
export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<SendResult> {
  const e = env();
  if (!e.RESEND_API_KEY || !e.ALERT_FROM_EMAIL) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: e.ALERT_FROM_EMAIL,
        to: [input.to],
        // Header injection guard: subjects are single-line.
        subject: input.subject.replace(/[\r\n]+/g, " ").slice(0, 150),
        html: input.html,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
