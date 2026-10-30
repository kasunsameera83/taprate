import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { sendEmailBatch, type OutgoingEmail } from "@/lib/email";
import { buildLinkToken, buildRecoveryTag, createPurposeToken, signMetadata } from "@/lib/security/signing";
import { buildSnippetHtml } from "@/lib/surveys/snippet";
import { isIconSetId } from "@/lib/surveys/iconSets";
import { iconUrlMap, labelsFor, resolveOptions } from "@/lib/surveys/customIcons";
import { logoUrl } from "@/lib/branding";
import { buildSurveyEmail, safeFromName } from "@/lib/sending/emailTemplate";
import { isLang } from "@/lib/i18n/public";
import { planAllows } from "@/lib/billing/features";
import { publicOriginFor } from "@/lib/surveyDomains";

// The sending engine. Called by the app right after a send is created (and while its page is open),
// by the public API for single emails, and by the daily job for leftovers and reminders.
// Always works with the service role, on rows the database handed out with claim_send_batch.

export const UNSUB_SEND_PURPOSE = "send-unsub";
export const UNSUB_TTL_SECONDS = 400 * 86400;
const BATCH = 100;

type RecipientRow = { id: string; send_id: string; account_id: string; survey_id: string; email: string; name: string | null; agent: string | null; ticket: string | null; recovery_of?: string | null };
type SendInfo = { subject: string; intro: string; reply_to: string | null };
type SurveyInfo = { id: string; question: string; icon_set: string; brand_color: string; icon_images: unknown; option_labels: unknown; language: string };
type AccountInfo = { name: string; logo_path: string | null; fromAddress: string | null; origin: string };

export function unsubscribeLinks(recipientId: string, now = Math.floor(Date.now() / 1000)) {
  const e = env();
  const t = createPurposeToken(e.RESPONSE_TOKEN_SECRET, UNSUB_SEND_PURPOSE, recipientId, UNSUB_TTL_SECONDS, now);
  const q = `r=${recipientId}&t=${encodeURIComponent(t)}`;
  return { page: `${e.appOrigin}/unsubscribe?${q}`, oneClick: `${e.appOrigin}/api/public/unsubscribe/one-click?${q}` };
}

/** Rating links that carry this customer's details, signed so they can't be altered. */
export function recipientLinks(surveyId: string, r: Pick<RecipientRow, "email" | "agent" | "ticket" | "recovery_of">, origin?: string) {
  const e = env();
  const meta = { email: r.email, agent: r.agent, ticket: r.ticket };
  const sp = new URLSearchParams();
  sp.set("e", r.email);
  if (r.agent) sp.set("a", r.agent);
  if (r.ticket) sp.set("t", r.ticket);
  sp.set("s", signMetadata(e.LINK_SIGNING_SECRET, surveyId, meta));
  // "Did we fix it?" emails link the answer to the original rating.
  if (r.recovery_of) sp.set("rv", buildRecoveryTag(e.LINK_SIGNING_SECRET, surveyId, r.recovery_of));
  const qs = sp.toString();
  return (rating: number) => `${origin ?? e.appOrigin}/r/${buildLinkToken(e.LINK_SIGNING_SECRET, surveyId, rating)}?${qs}`;
}

class Cache {
  sends = new Map<string, SendInfo | null>();
  surveys = new Map<string, SurveyInfo | null>();
  accounts = new Map<string, AccountInfo | null>();
  constructor(private db: SupabaseClient) {}
  async send(id: string, account: string) {
    if (!this.sends.has(id)) {
      const { data } = await this.db.from("survey_sends").select("subject, intro, reply_to").eq("id", id).eq("account_id", account).maybeSingle();
      this.sends.set(id, (data as SendInfo | null) ?? null);
    }
    return this.sends.get(id) ?? null;
  }
  async survey(id: string, account: string) {
    if (!this.surveys.has(id)) {
      const { data } = await this.db.from("surveys").select("id, question, icon_set, brand_color, icon_images, option_labels, language").eq("id", id).eq("account_id", account).maybeSingle();
      this.surveys.set(id, (data as SurveyInfo | null) ?? null);
    }
    return this.surveys.get(id) ?? null;
  }
  async account(id: string) {
    if (!this.accounts.has(id)) {
      const [{ data }, { data: dom }, origin] = await Promise.all([
        this.db.from("accounts").select("name, logo_path, plan").eq("id", id).maybeSingle(),
        // Only a domain the email provider has verified.
        this.db.from("sending_domains").select("domain, from_local").eq("account_id", id).eq("status", "verified").maybeSingle(),
        // Survey links on the business's own web address when it has one (Scale).
        publicOriginFor(id),
      ]);
      this.accounts.set(id, data ? { name: data.name as string, logo_path: (data.logo_path as string | null) ?? null, // Own domain only while on the Scale plan; otherwise our normal address.
          fromAddress: dom && planAllows(data.plan as string, "own_domain") ? `${dom.from_local}@${dom.domain}` : null, origin } : null);
    }
    return this.accounts.get(id) ?? null;
  }
}

async function buildFor(cache: Cache, r: RecipientRow, reminder: boolean, override?: { subject?: string; intro?: string }): Promise<OutgoingEmail | null> {
  const [send, survey, account] = await Promise.all([cache.send(r.send_id, r.account_id), cache.survey(r.survey_id, r.account_id), cache.account(r.account_id)]);
  if (!send || !survey || !account || !isIconSetId(survey.icon_set)) return null;
  const iconSet = survey.icon_set;
  const lang = isLang(survey.language) ? survey.language : "en";
  const options = resolveOptions(iconSet, { images: iconUrlMap(iconSet, survey.icon_images), labels: labelsFor(iconSet, survey.option_labels) }, lang);
  const urlFor = recipientLinks(survey.id, r, account.origin);
  const e = env();
  const buttonsHtml = buildSnippetHtml({
    appUrl: account.origin,
    surveyId: survey.id,
    iconSet,
    question: survey.question,
    brandColor: survey.brand_color,
    mergeTags: { email: "", agent: "", ticket: "" },
    signToken: (id, rating) => buildLinkToken(e.LINK_SIGNING_SECRET, id, rating),
    options,
    urlFor,
    lang,
  });
  const unsub = unsubscribeLinks(r.id);
  const mail = buildSurveyEmail({
    businessName: account.name,
    logoUrl: logoUrl(account.logo_path),
    subject: override?.subject ?? send.subject,
    intro: override?.intro ?? send.intro,
    recipientName: r.name,
    buttonsHtml,
    buttonLinks: options.map((o) => ({ label: o.label, url: urlFor(o.value) })),
    unsubscribeUrl: unsub.page,
    reminder,
    lang,
  });
  return {
    to: r.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    fromName: safeFromName(account.name),
    fromAddress: account.fromAddress,
    replyTo: send.reply_to,
    headers: { "List-Unsubscribe": `<${unsub.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "X-Entity-Ref-ID": r.id },
  };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ProcessResult = { sent: number; failed: number; remaining: number; notConfigured: boolean };

/**
 * Sends queued emails (of one send, or of every send when sendId is null) until the queue is empty or
 * the time budget is used up. Batches of 100, paced to stay inside the email provider's rate limit.
 */
export async function processQueue(db: SupabaseClient, opts: { sendId: string | null; budgetMs?: number; override?: { subject?: string; intro?: string } }): Promise<ProcessResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const cache = new Cache(db);
  let sent = 0;
  let failed = 0;
  let notConfigured = false;

  while (Date.now() - started < budget) {
    const { data, error } = await db.rpc("claim_send_batch", { p_send: opts.sendId, p_limit: BATCH });
    if (error) {
      console.error("[send] claim failed", { code: error.code });
      break;
    }
    const rows = (data ?? []) as RecipientRow[];
    if (rows.length === 0) break;

    const built: Array<{ row: RecipientRow; mail: OutgoingEmail }> = [];
    const broken: string[] = [];
    for (const row of rows) {
      const mail = await buildFor(cache, row, false, opts.override);
      if (mail) built.push({ row, mail });
      else broken.push(row.id);
    }
    if (broken.length) await db.from("send_recipients").update({ status: "failed", claimed_at: null }).in("id", broken);

    const result = await sendEmailBatch(built.map((b) => b.mail));
    const ids = built.map((b) => b.row.id);
    if (result === "skipped") {
      // Email isn't set up on this server: put them back so nothing is lost.
      await db.from("send_recipients").update({ status: "queued", claimed_at: null }).in("id", ids);
      notConfigured = true;
      break;
    }
    if (result === "sent") {
      await db.from("send_recipients").update({ status: "sent", sent_at: new Date().toISOString(), claimed_at: null }).in("id", ids);
      sent += ids.length;
    } else {
      await db.from("send_recipients").update({ status: "failed", claimed_at: null }).in("id", ids);
      failed += ids.length;
    }
    failed += broken.length;
    if (rows.length < BATCH) break;
    await pause(600);
  }

  let remaining = 0;
  if (opts.sendId) {
    const { count } = await db.from("send_recipients").select("id", { count: "exact", head: true }).eq("send_id", opts.sendId).in("status", ["queued", "sending"]);
    remaining = count ?? 0;
  }
  return { sent, failed, remaining, notConfigured };
}

/** One reminder to people who haven't rated yet, for sends that asked for it. */
export async function sendReminders(db: SupabaseClient, limit = 500): Promise<{ reminded: number; failed: number }> {
  const { data, error } = await db.rpc("reminders_due", { p_limit: limit });
  if (error) return { reminded: 0, failed: 0 };
  const rows = (data ?? []) as RecipientRow[];
  const cache = new Cache(db);
  let reminded = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const built: Array<{ row: RecipientRow; mail: OutgoingEmail }> = [];
    for (const row of chunk) {
      const mail = await buildFor(cache, row, true);
      if (mail) built.push({ row, mail });
    }
    const result = await sendEmailBatch(built.map((b) => b.mail));
    if (result === "skipped") break;
    const ids = chunk.map((r) => r.id);
    // Marked either way: a reminder is only ever tried once.
    await db.from("send_recipients").update({ reminded_at: new Date().toISOString() }).in("id", ids);
    if (result === "sent") reminded += built.length;
    else failed += built.length;
    await pause(600);
  }
  return { reminded, failed };
}
