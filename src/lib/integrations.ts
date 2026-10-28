import "server-only";
import { lookup } from "node:dns/promises";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { open } from "@/lib/security/secretBox";
import { checkIntegrationUrl, isHelpdesk, isPrivateAddress, type HelpdeskKind, type IntegrationKind } from "@/lib/security/urlSafety";
import {
  buildCheckRequest,
  buildNoteRequest,
  frontCommentRequest,
  frontConversationId,
  checkResponseOk,
  intercomAdminId,
  intercomMeRequest,
  intercomNoteRequest,
  intercomSearchRequest,
  latestIntercomConversation,
  noteText,
  ticketNumber,
} from "@/lib/helpdesk";
import { isIconSetId, ratingOption } from "@/lib/surveys/iconSets";
import { signWebhook } from "@/lib/security/webhookSignature";

export type RatingEvent = {
  id: string;
  accountId: string;
  survey: { id: string; name: string };
  rating: number;
  ratingLabel: string;
  sentiment: "positive" | "neutral" | "negative";
  email: string | null;
  agent: string | null;
  ticket: string | null;
  channel: string;
  createdAt: string;
  comment?: string | null;
};

export type IntegrationRow = { id: string; kind: IntegrationKind; url_encrypted: string; secret_encrypted: string | null; events: string[] };

/** Loads everything needed about a confirmed rating (service role, scoped to the response id). */
export async function loadRatingEvent(responseId: string): Promise<RatingEvent | null> {
  const { data } = await adminClient()
    .from("responses")
    .select("id, account_id, rating, sentiment, comment, respondent_email, agent, ticket_ref, channel, created_at, surveys(id, name, icon_set)")
    .eq("id", responseId)
    .eq("status", "confirmed")
    .maybeSingle();
  const s = (data?.surveys ?? null) as unknown as { id: string; name: string; icon_set: string } | null;
  if (!data || !s || data.rating === null || !data.sentiment || !isIconSetId(s.icon_set)) return null;
  return {
    id: data.id,
    accountId: data.account_id,
    survey: { id: s.id, name: s.name },
    rating: data.rating,
    ratingLabel: ratingOption(s.icon_set, data.rating)?.label ?? String(data.rating),
    sentiment: data.sentiment,
    email: data.respondent_email,
    agent: data.agent,
    ticket: data.ticket_ref,
    channel: data.channel,
    createdAt: data.created_at,
    comment: data.comment,
  };
}

const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function summary(e: RatingEvent): string {
  const who = e.email ?? "A customer";
  return `${who} rated ${e.ratingLabel} (${e.rating}) on "${e.survey.name}"${e.agent ? ` for ${e.agent}` : ""}${e.ticket ? `, ticket ${e.ticket}` : ""}.`;
}

export function buildPayload(kind: IntegrationKind, e: RatingEvent, appOrigin: string): unknown {
  const link = `${appOrigin}/app/responses?surveyId=${encodeURIComponent(e.survey.id)}`;
  const icon = e.sentiment === "negative" ? "🔴" : e.sentiment === "neutral" ? "🟡" : "🟢";
  if (kind === "slack") {
    return { text: `${icon} ${slackEscape(summary(e))} <${link}|Open TapTruly>` };
  }
  if (kind === "teams") {
    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            body: [{ type: "TextBlock", text: `${icon} ${summary(e)}`, wrap: true }],
            actions: [{ type: "Action.OpenUrl", title: "Open TapTruly", url: link }],
          },
        },
      ],
    };
  }
  return {
    event: "rating.created",
    id: e.id,
    created_at: e.createdAt,
    survey: e.survey,
    rating: { value: e.rating, label: e.ratingLabel, sentiment: e.sentiment },
    customer: { email: e.email },
    agent: e.agent,
    ticket: e.ticket,
    channel: e.channel,
  };
}

/** Sends one request after re-checking the URL and that its DNS doesn't point at a private network. */
async function sendSafely(
  kind: IntegrationKind,
  rawUrl: string,
  init: { method: "GET" | "POST" | "PUT"; body?: string; headers: Record<string, string> },
  readJson = false,
): Promise<{ status: "ok" | "failed" | "blocked"; http?: number; json?: unknown }> {
  const check = checkIntegrationUrl(kind, rawUrl);
  if (!check.ok) return { status: "blocked" };
  try {
    const addrs = await lookup(check.url.hostname, { all: true, verbatim: true });
    if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return { status: "blocked" };
  } catch {
    return { status: "failed" };
  }
  try {
    const res = await fetch(check.url, {
      method: init.method,
      headers: { ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), Accept: "application/json", "User-Agent": "TapTruly-Webhooks/1.0", ...init.headers },
      body: init.body,
      redirect: "manual", // never follow redirects to somewhere we didn't check
      signal: AbortSignal.timeout(5000),
    });
    let json: unknown = undefined;
    if (readJson) {
      // Read at most 64 KB of the answer.
      const text = (await res.text()).slice(0, 65536);
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.ok ? "ok" : "failed", http: res.status, json };
  } catch {
    return { status: "failed" };
  }
}

async function logDelivery(row: IntegrationRow, accountId: string, event: string, result: { status: "ok" | "failed" | "blocked" | "skipped"; http?: number }) {
  if (result.status === "skipped") return;
  const db = adminClient();
  await Promise.all([
    db.from("integration_deliveries").insert({ account_id: accountId, integration_id: row.id, event, status: result.status, http_status: result.http ?? null }),
    db.from("integrations").update({ last_status: result.status === "ok" ? "ok" : "failed", last_delivery_at: new Date().toISOString() }).eq("id", row.id),
  ]);
}

/** Can this rating be matched to a ticket or conversation in this helpdesk? */
const matchable = (kind: HelpdeskKind, e: RatingEvent) =>
  kind === "intercom" ? Boolean(e.email) : kind === "front" ? Boolean(frontConversationId(e.ticket)) : Boolean(ticketNumber(e.ticket));

/** Intercom: find the customer's latest conversation by email, then add the note as the token's admin. */
async function deliverToIntercom(e: RatingEvent, base: string, token: string, text: string): Promise<{ status: "ok" | "failed" | "blocked" | "skipped"; http?: number }> {
  const meReq = intercomMeRequest(base, token);
  const me = await sendSafely("intercom", meReq.url, { method: meReq.method, headers: meReq.headers }, true);
  if (me.status !== "ok") return me;
  const adminId = intercomAdminId(me.json);
  if (!adminId) return { status: "failed", http: me.http };
  const search = intercomSearchRequest(base, token, e.email!, Date.now() / 1000 - 14 * 86400);
  const found = await sendSafely("intercom", search.url, { method: search.method, body: search.body, headers: search.headers }, true);
  if (found.status !== "ok") return found;
  const conversation = latestIntercomConversation(found.json);
  if (!conversation) return { status: "skipped" };
  const note = intercomNoteRequest(base, token, conversation, adminId, text);
  return sendSafely("intercom", note.url, { method: note.method, body: note.body, headers: note.headers });
}

/** Adds a private note to the rating's ticket (or Intercom conversation). Ratings we can't match are skipped. */
async function deliverToHelpdesk(row: IntegrationRow & { kind: HelpdeskKind }, e: RatingEvent, what: "rating" | "comment"): Promise<"ok" | "failed" | "blocked" | "skipped"> {
  if (!matchable(row.kind, e)) return "skipped";
  const ticket = ticketNumber(e.ticket);
  const ev = env();
  const base = open(ev.RESPONSE_TOKEN_SECRET, row.url_encrypted);
  const credential = row.secret_encrypted ? open(ev.RESPONSE_TOKEN_SECRET, row.secret_encrypted) : null;
  if (!base || !credential) return "failed";
  const text = noteText(
    { ratingLabel: e.ratingLabel, rating: e.rating, sentiment: e.sentiment, surveyName: e.survey.name, agent: e.agent, comment: e.comment, link: `${ev.appOrigin}/app/responses?surveyId=${encodeURIComponent(e.survey.id)}` },
    what,
    row.kind === "intercom" ? "customer" : "ticket",
  );
  let result: { status: "ok" | "failed" | "blocked" | "skipped"; http?: number };
  if (row.kind === "intercom") {
    result = await deliverToIntercom(e, base, credential, text);
    if (result.status === "skipped") return "skipped"; // no recent conversation with this customer
  } else if (row.kind === "front") {
    const req = frontCommentRequest(credential, frontConversationId(e.ticket)!, text);
    result = await sendSafely("front", req.url, { method: req.method, body: req.body, headers: req.headers });
  } else {
    const req = buildNoteRequest(row.kind as "zendesk" | "freshdesk" | "gorgias", base, credential, ticket!, text);
    result = await sendSafely(row.kind, req.url, { method: req.method, body: req.body, headers: req.headers });
  }
  await logDelivery(row, e.accountId, what === "rating" ? "rating.created" : "rating.commented", result);
  return result.status;
}

/** "Send test" for a helpdesk: a read-only call that proves the address and credentials work. */
export async function checkHelpdesk(row: IntegrationRow & { kind: HelpdeskKind }): Promise<"ok" | "failed" | "blocked"> {
  const ev = env();
  const base = open(ev.RESPONSE_TOKEN_SECRET, row.url_encrypted);
  const credential = row.secret_encrypted ? open(ev.RESPONSE_TOKEN_SECRET, row.secret_encrypted) : null;
  if (!base || !credential) return "failed";
  const req = buildCheckRequest(row.kind, base, credential);
  const result = await sendSafely(row.kind, req.url, { method: req.method, headers: req.headers }, true);
  if (result.status !== "ok") return result.status;
  return checkResponseOk(row.kind, result.http ?? 0, result.json) ? "ok" : "failed";
}

export async function deliverTo(row: IntegrationRow, e: RatingEvent): Promise<"ok" | "failed" | "blocked" | "skipped"> {
  if (isHelpdesk(row.kind)) return deliverToHelpdesk(row as IntegrationRow & { kind: HelpdeskKind }, e, "rating");
  const ev = env();
  const url = open(ev.RESPONSE_TOKEN_SECRET, row.url_encrypted);
  if (!url) return "failed";
  const body = JSON.stringify(buildPayload(row.kind, e, ev.appOrigin));
  const headers: Record<string, string> = {};
  if (row.kind === "webhook") {
    const secret = row.secret_encrypted ? open(ev.RESPONSE_TOKEN_SECRET, row.secret_encrypted) : null;
    if (!secret) return "failed";
    headers["X-TapTruly-Event"] = "rating.created";
    headers["X-TapTruly-Signature"] = signWebhook(secret, body);
  }
  const result = await sendSafely(row.kind, url, { method: "POST", body, headers });
  await logDelivery(row, e.accountId, "rating.created", result);
  return result.status;
}

const wants = (i: IntegrationRow, e: RatingEvent) => i.events.includes("all") || (i.events.includes("negative") && e.sentiment === "negative");

async function enabledIntegrations(accountId: string): Promise<IntegrationRow[]> {
  const { data } = await adminClient()
    .from("integrations")
    .select("id, kind, url_encrypted, secret_encrypted, events")
    .eq("account_id", accountId)
    .eq("enabled", true)
    .limit(20);
  return (data ?? []) as IntegrationRow[];
}

/** A customer's first comment on a rating goes to the helpdesk ticket too (Slack/Teams/webhooks get ratings only). */
export async function dispatchComment(responseId: string): Promise<void> {
  try {
    const e = await loadRatingEvent(responseId);
    if (!e || !e.comment) return;
    const targets = (await enabledIntegrations(e.accountId)).filter((i) => isHelpdesk(i.kind) && matchable(i.kind, e) && wants(i, e));
    await Promise.allSettled(targets.map((t) => deliverToHelpdesk(t as IntegrationRow & { kind: HelpdeskKind }, e, "comment")));
  } catch (err) {
    console.error("[integrations] comment dispatch failed", { err });
  }
}

/** Sends a confirmed rating to every enabled integration that wants it. Never throws. */
export async function dispatchRating(responseId: string): Promise<void> {
  try {
    const e = await loadRatingEvent(responseId);
    if (!e) return;
    // Shopify connections only send orders to us; they never receive ratings.
    const targets = (await enabledIntegrations(e.accountId)).filter((i) => i.kind !== "shopify" && wants(i, e));
    await Promise.allSettled(targets.map((t) => deliverTo(t, e)));
  } catch (err) {
    console.error("[integrations] dispatch failed", { err });
  }
}
