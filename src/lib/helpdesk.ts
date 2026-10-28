// Helpdesk post-back: adds each rating as a PRIVATE note on the ticket (Zendesk, Freshdesk, Gorgias) or
// conversation (Intercom, and Front as an internal comment) it was given for. Pure (no network), unit-tested. integrations.ts does the
// sending with the usual safety checks.
import { FRONT_HOST, INTERCOM_HOSTS, type HelpdeskKind } from "./security/urlSafety.ts";
import { escapeHtml } from "./security/html.ts";

/** Subdomain helpdesks: the address is always <name>.<helpdesk>.com, built by us. */
export type SubdomainHelpdesk = "zendesk" | "freshdesk" | "gorgias";
export type IntercomRegion = keyof typeof INTERCOM_HOSTS;

/** Pinned so Intercom's answers keep the shape we read. */
export const INTERCOM_VERSION = "2.11";

export function helpdeskBaseUrl(kind: SubdomainHelpdesk, subdomain: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) throw new Error("invalid subdomain");
  return `https://${subdomain}.${kind}.com`;
}

export const FRONT_BASE = `https://${FRONT_HOST}`;

/** Front conversation ids look like cnv_1a2b3c (what {{conversation.id}} puts in the link). */
export function frontConversationId(ticket: string | null | undefined): string | null {
  const v = (ticket ?? "").trim();
  return /^cnv_[a-z0-9]{1,40}$/.test(v) ? v : null;
}

export function intercomBaseUrl(region: IntercomRegion): string {
  const host = INTERCOM_HOSTS[region];
  if (!host) throw new Error("invalid region");
  return `https://${host}`;
}

/** Credentials in the form each helpdesk expects. Stored encrypted. */
export function helpdeskCredential(
  input: { kind: "zendesk"; email: string; apiToken: string } | { kind: "freshdesk"; apiKey: string } | { kind: "gorgias"; email: string; apiKey: string } | { kind: "intercom"; accessToken: string } | { kind: "front"; apiToken: string },
): string {
  switch (input.kind) {
    case "zendesk":
      return `${input.email}/token:${input.apiToken}`;
    case "freshdesk":
      return `${input.apiKey}:X`;
    case "gorgias":
      return `${input.email}:${input.apiKey}`;
    case "intercom":
      return input.accessToken;
    case "front":
      return input.apiToken;
  }
}

/** Ticket ids are numbers. Accepts "1042" or "#1042"; anything else isn't a ticket we can update. */
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

/** "ticket": the rating was given for this ticket. "customer": matched by email (Intercom), so it may be about something else. */
export function noteText(e: NoteEvent, kind: "rating" | "comment", scope: "ticket" | "customer" = "ticket"): string {
  if (kind === "comment") return `TapTruly: the customer added a comment:\n\n${e.comment ?? ""}\n\n${e.link}`;
  const face = e.sentiment === "negative" ? "🔴" : e.sentiment === "neutral" ? "🟡" : "🟢";
  const what = scope === "ticket" ? "the customer rated this ticket" : "this customer rated you";
  return `${face} TapTruly: ${what} ${e.ratingLabel} (${e.rating}) on "${e.surveyName}"${e.agent ? ` for ${e.agent}` : ""}.\n\n${e.link}`;
}

/** Customer text as safe HTML (for helpdesks whose notes are HTML). */
const asHtml = (text: string) => escapeHtml(text).replace(/\n/g, "<br>");

export type HelpdeskRequest = { url: string; method: "GET" | "POST" | "PUT"; headers: Record<string, string>; body?: string };

function auth(kind: HelpdeskKind, credential: string): Record<string, string> {
  if (kind === "intercom") return { Authorization: `Bearer ${credential}`, "Intercom-Version": INTERCOM_VERSION };
  if (kind === "front") return { Authorization: `Bearer ${credential}` };
  return { Authorization: `Basic ${Buffer.from(credential, "utf8").toString("base64")}` };
}

/** The request that adds the note to a ticket (Zendesk, Freshdesk, Gorgias). */
export function buildNoteRequest(kind: SubdomainHelpdesk, baseUrl: string, credential: string, ticketId: string, text: string): HelpdeskRequest {
  if (!/^\d{1,15}$/.test(ticketId)) throw new Error("invalid ticket id");
  if (kind === "zendesk") {
    return {
      url: `${baseUrl}/api/v2/tickets/${ticketId}.json`,
      method: "PUT",
      headers: auth(kind, credential),
      body: JSON.stringify({ ticket: { comment: { body: text, public: false } } }),
    };
  }
  if (kind === "gorgias") {
    // Internal notes are written as the API user (the email the business connected with).
    const sender = credential.slice(0, credential.indexOf(":"));
    return {
      url: `${baseUrl}/api/tickets/${ticketId}/messages`,
      method: "POST",
      headers: auth(kind, credential),
      body: JSON.stringify({ channel: "internal-note", via: "api", from_agent: true, sender: { email: sender }, body_text: text, body_html: asHtml(text) }),
    };
  }
  return {
    url: `${baseUrl}/api/v2/tickets/${ticketId}/notes`,
    method: "POST",
    headers: auth(kind, credential),
    body: JSON.stringify({ body: asHtml(text), private: true }),
  };
}

// ---------------------------------------------------------------------------
// Intercom: macros can't insert a conversation id, so we find the customer's most recent conversation
// by their email address (last 14 days), then add the note as the admin who owns the access token.
// ---------------------------------------------------------------------------

const INTERCOM_ID = /^\d{1,20}$/;
const EMAIL = /^[^\s@"<>]{1,64}@[^\s@"<>]{1,190}$/;

/** Who owns the token (an admin id is needed to write a note). */
export function intercomMeRequest(baseUrl: string, token: string): HelpdeskRequest {
  return { url: `${baseUrl}/me`, method: "GET", headers: auth("intercom", token) };
}

export function intercomAdminId(json: unknown): string | null {
  const j = json as { type?: unknown; id?: unknown } | null;
  const id = typeof j?.id === "number" ? String(j.id) : j?.id;
  return j?.type === "admin" && typeof id === "string" && INTERCOM_ID.test(id) ? id : null;
}

export function intercomSearchRequest(baseUrl: string, token: string, email: string, sinceUnix: number): HelpdeskRequest {
  if (!EMAIL.test(email) || email.length > 254) throw new Error("invalid email");
  return {
    url: `${baseUrl}/conversations/search`,
    method: "POST",
    headers: auth("intercom", token),
    body: JSON.stringify({
      query: {
        operator: "AND",
        value: [
          { field: "source.author.email", operator: "=", value: email },
          { field: "updated_at", operator: ">", value: Math.floor(sinceUnix) },
        ],
      },
      pagination: { per_page: 20 },
    }),
  };
}

/** The most recently updated conversation in a search answer, or null. */
export function latestIntercomConversation(json: unknown): string | null {
  const list = (json as { conversations?: unknown } | null)?.conversations;
  if (!Array.isArray(list)) return null;
  let best: { id: string; at: number } | null = null;
  for (const c of list.slice(0, 50) as Array<{ id?: unknown; updated_at?: unknown }>) {
    const id = typeof c?.id === "number" ? String(c.id) : c?.id;
    const at = typeof c?.updated_at === "number" ? c.updated_at : 0;
    if (typeof id === "string" && INTERCOM_ID.test(id) && (!best || at > best.at)) best = { id, at };
  }
  return best?.id ?? null;
}

export function intercomNoteRequest(baseUrl: string, token: string, conversationId: string, adminId: string, text: string): HelpdeskRequest {
  if (!INTERCOM_ID.test(conversationId) || !INTERCOM_ID.test(adminId)) throw new Error("invalid id");
  return {
    url: `${baseUrl}/conversations/${conversationId}/reply`,
    method: "POST",
    headers: auth("intercom", token),
    body: JSON.stringify({ message_type: "note", type: "admin", admin_id: adminId, body: `<p>${asHtml(text)}</p>` }),
  };
}

// ---------------------------------------------------------------------------
// Front: an internal comment on the conversation (only teammates see comments). Without an author it
// appears as written by the API token's own bot, so no teammate id is needed.
// ---------------------------------------------------------------------------

export function frontCommentRequest(token: string, conversationId: string, text: string): HelpdeskRequest {
  if (!frontConversationId(conversationId)) throw new Error("invalid conversation id");
  return {
    url: `${FRONT_BASE}/conversations/${conversationId}/comments`,
    method: "POST",
    headers: auth("front", token),
    body: JSON.stringify({ body: text }),
  };
}

// ---------------------------------------------------------------------------

/** A read-only request that only succeeds with working credentials (used by "Check connection"). */
export function buildCheckRequest(kind: HelpdeskKind, baseUrl: string, credential: string): HelpdeskRequest {
  const path = { zendesk: "/api/v2/users/me.json", freshdesk: "/api/v2/agents/me", gorgias: "/api/account", intercom: "/me", front: "/me" }[kind];
  return { url: `${baseUrl}${path}`, method: "GET", headers: auth(kind, credential) };
}

/** Zendesk answers users/me with an anonymous user (id null) when the credentials are wrong. */
export function checkResponseOk(kind: HelpdeskKind, status: number, json: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  if (kind === "intercom") return intercomAdminId(json) !== null;
  if (kind !== "zendesk") return true;
  const id = (json as { user?: { id?: unknown } } | null)?.user?.id;
  return typeof id === "number" && id > 0;
}
