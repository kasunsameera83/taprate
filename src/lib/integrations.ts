import "server-only";
import { lookup } from "node:dns/promises";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { open } from "@/lib/security/secretBox";
import { checkIntegrationUrl, isPrivateAddress, type IntegrationKind } from "@/lib/security/urlSafety";
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
};

type IntegrationRow = { id: string; kind: IntegrationKind; url_encrypted: string; secret_encrypted: string | null; events: string[] };

/** Loads everything needed about a confirmed rating (service role, scoped to the response id). */
export async function loadRatingEvent(responseId: string): Promise<RatingEvent | null> {
  const { data } = await adminClient()
    .from("responses")
    .select("id, account_id, rating, sentiment, respondent_email, agent, ticket_ref, channel, created_at, surveys(id, name, icon_set)")
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
    return { text: `${icon} ${slackEscape(summary(e))} <${link}|Open TapRate>` };
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
            actions: [{ type: "Action.OpenUrl", title: "Open TapRate", url: link }],
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
async function sendSafely(kind: IntegrationKind, rawUrl: string, body: string, headers: Record<string, string>): Promise<{ status: "ok" | "failed" | "blocked"; http?: number }> {
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
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "TapRate-Webhooks/1.0", ...headers },
      body,
      redirect: "manual", // never follow redirects to somewhere we didn't check
      signal: AbortSignal.timeout(5000),
    });
    return { status: res.ok ? "ok" : "failed", http: res.status };
  } catch {
    return { status: "failed" };
  }
}

export async function deliverTo(row: IntegrationRow, e: RatingEvent): Promise<"ok" | "failed" | "blocked"> {
  const ev = env();
  const url = open(ev.RESPONSE_TOKEN_SECRET, row.url_encrypted);
  if (!url) return "failed";
  const body = JSON.stringify(buildPayload(row.kind, e, ev.appOrigin));
  const headers: Record<string, string> = {};
  if (row.kind === "webhook") {
    const secret = row.secret_encrypted ? open(ev.RESPONSE_TOKEN_SECRET, row.secret_encrypted) : null;
    if (!secret) return "failed";
    headers["X-TapRate-Event"] = "rating.created";
    headers["X-TapRate-Signature"] = signWebhook(secret, body);
  }
  const result = await sendSafely(row.kind, url, body, headers);
  const db = adminClient();
  await Promise.all([
    db.from("integration_deliveries").insert({ account_id: e.accountId, integration_id: row.id, event: "rating.created", status: result.status, http_status: result.http ?? null }),
    db.from("integrations").update({ last_status: result.status === "ok" ? "ok" : "failed", last_delivery_at: new Date().toISOString() }).eq("id", row.id),
  ]);
  return result.status;
}

/** Sends a confirmed rating to every enabled integration that wants it. Never throws. */
export async function dispatchRating(responseId: string): Promise<void> {
  try {
    const e = await loadRatingEvent(responseId);
    if (!e) return;
    const { data } = await adminClient()
      .from("integrations")
      .select("id, kind, url_encrypted, secret_encrypted, events")
      .eq("account_id", e.accountId)
      .eq("enabled", true)
      .limit(20);
    const targets = ((data ?? []) as IntegrationRow[]).filter((i) => i.events.includes("all") || (i.events.includes("negative") && e.sentiment === "negative"));
    await Promise.allSettled(targets.map((t) => deliverTo(t, e)));
  } catch (err) {
    console.error("[integrations] dispatch failed", { err });
  }
}
