// Zendesk / Freshdesk post-back: adds each rating as a PRIVATE note on the ticket it was given for.
// Pure (no network), unit-tested. integrations.ts does the sending with the usual safety checks.
import type { HelpdeskKind } from "./security/urlSafety.ts";
import { escapeHtml } from "./security/html.ts";

export function helpdeskBaseUrl(kind: HelpdeskKind, subdomain: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) throw new Error("invalid subdomain");
  return `https://${subdomain}.${kind}.com`;
}

/** Basic-auth credentials in the form each helpdesk expects. Stored encrypted. */
export function helpdeskCredential(input: { kind: "zendesk"; email: string; apiToken: string } | { kind: "freshdesk"; apiKey: string }): string {
  return input.kind === "zendesk" ? `${input.email}/token:${input.apiToken}` : `${input.apiKey}:X`;
}

/** Helpdesk ticket ids are numbers. Accepts "1042" or "#1042"; anything else isn't a ticket we can update. */
export function ticketNumber(ticket: string | null | undefined): string | null {
  const m = /^#?(\d{1,15})$/.exec((ticket ?? "").trim());
  return m?.[1] && m[1] !== "0".repeat(m[1].length) ? m[1] : null;
}

export type NoteEvent = {
  ratingLabel: string;
  rating: number;
  sentiment: "positive" | "neutral" | "negative";
  surveyName: string;
  agent: string | null;
  comment?: string | null;
  link: string;
};

export function noteText(e: NoteEvent, kind: "rating" | "comment"): string {
  if (kind === "comment") return `TapRate: the customer added a comment:\n\n${e.comment ?? ""}\n\n${e.link}`;
  const face = e.sentiment === "negative" ? "🔴" : e.sentiment === "neutral" ? "🟡" : "🟢";
  return `${face} TapRate: the customer rated this ticket ${e.ratingLabel} (${e.rating}) on "${e.surveyName}"${e.agent ? ` for ${e.agent}` : ""}.\n\n${e.link}`;
}

export type HelpdeskRequest = { url: string; method: "GET" | "POST" | "PUT"; headers: Record<string, string>; body?: string };

function auth(credential: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(credential, "utf8").toString("base64")}` };
}

/** The request that adds the note. Freshdesk notes are HTML, so customer text is escaped. */
export function buildNoteRequest(kind: HelpdeskKind, baseUrl: string, credential: string, ticketId: string, text: string): HelpdeskRequest {
  if (!/^\d{1,15}$/.test(ticketId)) throw new Error("invalid ticket id");
  if (kind === "zendesk") {
    return {
      url: `${baseUrl}/api/v2/tickets/${ticketId}.json`,
      method: "PUT",
      headers: auth(credential),
      body: JSON.stringify({ ticket: { comment: { body: text, public: false } } }),
    };
  }
  return {
    url: `${baseUrl}/api/v2/tickets/${ticketId}/notes`,
    method: "POST",
    headers: auth(credential),
    body: JSON.stringify({ body: escapeHtml(text).replace(/\n/g, "<br>"), private: true }),
  };
}

/** A read-only request that only succeeds with working credentials (used by "Send test"). */
export function buildCheckRequest(kind: HelpdeskKind, baseUrl: string, credential: string): HelpdeskRequest {
  return { url: `${baseUrl}/api/v2/${kind === "zendesk" ? "users/me.json" : "agents/me"}`, method: "GET", headers: auth(credential) };
}

/** Zendesk answers users/me with an anonymous user (id null) when the credentials are wrong. */
export function checkResponseOk(kind: HelpdeskKind, status: number, json: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  if (kind === "freshdesk") return true;
  const id = (json as { user?: { id?: unknown } } | null)?.user?.id;
  return typeof id === "number" && id > 0;
}
