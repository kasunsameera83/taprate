"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { fieldErrors } from "@/lib/validation/schemas";
import { sendCreateSchema, SEND_MAX_RECIPIENTS } from "@/lib/validation/sending";
import { parseRecipientText } from "@/lib/sending/recipients";
import { DEFAULT_INTRO, fillPlaceholders } from "@/lib/sending/emailTemplate";
import { resolveOptions } from "@/lib/surveys/customIcons";
import { Badge, Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { EmailButtonsPreview } from "@/components/SurveyPreview";
import { IconUpload } from "@/components/icons";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PageLoader, Busy } from "@/components/FaceLoader";
import { useAllows } from "@/components/PlanContext";

// "Send by email": TapTruly emails the survey to a list of customers, with an optional reminder.

type SendItem = {
  id: string;
  name: string;
  subject: string;
  source: string;
  reminderDays: number | null;
  skipRecentDays: number;
  repeatDays: number | null;
  nextRunAt: string | null;
  createdAt: string;
  total: number;
  queued: number;
  sent: number;
  failed: number;
  suppressed: number;
  skippedRecent: number;
  reminded: number;
  rated: number;
};
type SendList = { credits: number | null; sends: SendItem[] };
type CreateResult = { id: string; queued: number; suppressed: number; skippedRecent: number; overLimit: number; sent: number; failed: number; remaining: number; notConfigured: boolean };
type ProcessResult = { sent: number; failed: number; remaining: number; notConfigured: boolean };
type Recipient = { id: string; email: string; name: string | null; status: string; sentAt: string | null; remindedAt: string | null; rated: boolean };

const MAX_FILE_BYTES = 1024 * 1024;
const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const n = (v: number) => v.toLocaleString("en");

const STATUS_LABEL: Record<string, { text: string; tone: "pos" | "neu" | "neg" | "plain" | "brand" }> = {
  queued: { text: "Waiting", tone: "plain" },
  sending: { text: "Sending", tone: "brand" },
  sent: { text: "Sent", tone: "pos" },
  failed: { text: "Not delivered", tone: "neg" },
  skipped_recent: { text: "Skipped: emailed recently", tone: "plain" },
  suppressed: { text: "Skipped: unsubscribed or bounced", tone: "neu" },
};

export function SendPanel({ survey, canSend }: { survey: Survey; canSend: boolean }) {
  const [list, setList] = useState<SendList | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<SendList>(`/api/surveys/${encodeURIComponent(survey.id)}/sends`).then((r) => (r.ok ? setList(r.data) : setError(r.message)));
  }, [survey.id]);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  return (
    <div className="space-y-6">
      {survey.status !== "active" ? (
        <Notice kind="info">This survey is paused. Turn it back on in Settings to send it by email.</Notice>
      ) : canSend ? (
        <Composer survey={survey} credits={list?.credits ?? null} onSent={load} />
      ) : null}
      <History survey={survey} list={list} canSend={canSend} onChanged={load} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({ survey, credits, onSent }: { survey: Survey; credits: number | null; onSent: () => void }) {
  const repeatsAllowed = useAllows("repeats");
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const [name, setName] = useState(`Survey email · ${today()}`);
  const [subject, setSubject] = useState(survey.question.slice(0, 150));
  const [intro, setIntro] = useState(DEFAULT_INTRO);
  const [replyTo, setReplyTo] = useState("");
  const [reminder, setReminder] = useState<"" | "3" | "5" | "7">("3");
  const [skipRecent, setSkipRecent] = useState<"0" | "30" | "60" | "90">("30");
  const [repeat, setRepeat] = useState<"" | "30" | "60" | "90">("");
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  useEffect(() => {
    api<{ email: string | null }>("/api/account").then((r) => r.ok && setMyEmail(r.data.email));
  }, []);

  /** One email to yourself with this subject and message, to see exactly what customers get. */
  async function sendTest() {
    if (!myEmail) return;
    setBusy(true);
    setNotice(null);
    const check = sendCreateSchema.safeParse({
      name: `Test to yourself · ${today()}`,
      subject,
      intro,
      replyTo,
      reminderDays: null,
      skipRecentDays: 0,
      recipients: [{ email: myEmail }],
      confirmCustomers: true,
    });
    if (!check.success) {
      setBusy(false);
      setErrors(fieldErrors(check.error));
      return;
    }
    const r = await api<CreateResult>(`/api/surveys/${encodeURIComponent(survey.id)}/sends`, { method: "POST", body: check.data });
    setBusy(false);
    if (!r.ok) setNotice({ kind: "error", text: r.message });
    else if (r.data.notConfigured) setNotice({ kind: "info", text: "Email isn't set up on this server yet (RESEND_API_KEY)." });
    else if (r.data.suppressed) setNotice({ kind: "info", text: "Your own address is on the do-not-email list, so the test wasn't sent." });
    else setNotice({ kind: "success", text: `Test sent to ${myEmail}. Open it and tap a button to see the whole journey.` });
    requestAnimationFrame(() => noticeRef.current?.focus());
    onSent();
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseRecipientText(raw), [raw]);
  const count = parsed.recipients.length;
  const sample = parsed.recipients.find((r) => r.name)?.name ?? "Amaya";
  const options = resolveOptions(survey.iconSet, { images: survey.iconImages, labels: survey.optionLabels }, survey.language);

  async function readFile(f: File) {
    setNotice(null);
    if (f.size > MAX_FILE_BYTES) return setNotice({ kind: "error", text: "That file is over 1 MB. Split it into smaller files (up to 1,000 people each)." });
    if (!/\.(csv|txt)$/i.test(f.name)) return setNotice({ kind: "error", text: "Upload a .csv or .txt file. In Excel or Google Sheets use “Download as CSV”." });
    const text = await f.text();
    if (/\u0000/.test(text.slice(0, 2000))) return setNotice({ kind: "error", text: "That doesn't look like a text file. Save it as CSV and try again." });
    setRaw(text);
    setFileName(f.name);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const values = {
      name,
      subject,
      intro,
      replyTo,
      reminderDays: reminder ? Number(reminder) : null,
      skipRecentDays: Number(skipRecent),
      recipients: parsed.recipients,
      confirmCustomers: confirm,
    };
    const check = sendCreateSchema.safeParse(values);
    if (!check.success) {
      setErrors(fieldErrors(check.error));
      setNotice({ kind: "error", text: "Some fields need attention. They're marked below." });
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    const ok = await confirmDialog({
      title: `Email ${n(count)} ${count === 1 ? "person" : "people"} now?`,
      body: `They'll get “${subject}” from your business.${reminder ? ` People who haven't rated get one reminder after ${reminder} days.` : ""} You can stop the send while it's going out.`,
      confirmLabel: `Send to ${n(count)}`,
    });
    if (!ok) return;

    setBusy(true);
    setNotice(null);
    const r = await api<CreateResult>(`/api/surveys/${encodeURIComponent(survey.id)}/sends`, { method: "POST", body: check.data });
    if (!r.ok) {
      setBusy(false);
      setErrors(r.fields ?? {});
      setNotice({ kind: "error", text: r.message });
      return;
    }
    // Repeating: the same list gets this survey again every 30/60/90 days.
    if (repeat) await api(`/api/sends/${encodeURIComponent(r.data.id)}`, { method: "PATCH", body: { repeatDays: Number(repeat) } });
    let { sent, failed, remaining } = r.data;
    let notConfigured = r.data.notConfigured;
    const total = r.data.queued;
    setProgress({ done: sent + failed, total });
    // Big sends keep going while this page is open (the daily job finishes anything left).
    while (remaining > 0 && !notConfigured) {
      const p = await api<ProcessResult>(`/api/sends/${encodeURIComponent(r.data.id)}/process`, { method: "POST" });
      if (!p.ok) break;
      sent += p.data.sent;
      failed += p.data.failed;
      remaining = p.data.remaining;
      notConfigured = p.data.notConfigured;
      setProgress({ done: sent + failed, total });
      if (p.data.sent + p.data.failed === 0) break;
    }
    setBusy(false);
    setProgress(null);

    const parts = [`${n(sent)} sent`];
    if (r.data.skippedRecent) parts.push(`${n(r.data.skippedRecent)} skipped (emailed recently)`);
    if (r.data.suppressed) parts.push(`${n(r.data.suppressed)} skipped (unsubscribed or bounced)`);
    if (failed) parts.push(`${n(failed)} not delivered`);
    if (notConfigured) {
      setNotice({ kind: "info", text: "Your send is saved, but email isn't set up on this server yet (RESEND_API_KEY). It will go out as soon as it is." });
    } else if (remaining > 0) {
      setNotice({ kind: "info", text: `${parts.join(" · ")}. The remaining ${n(remaining)} will finish sending within a day, or press “Continue sending” below.` });
    } else {
      setNotice({ kind: "success", text: `${parts.join(" · ")}.${r.data.overLimit ? ` ${n(r.data.overLimit)} weren't added because today's limit was reached. Send them tomorrow.` : ""}` });
    }
    requestAnimationFrame(() => noticeRef.current?.focus());
    setRaw("");
    setFileName("");
    setConfirm(false);
    setRepeat("");
    setName(`Survey email · ${today()}`);
    onSent();
  }

  return (
    <section aria-labelledby="send-title" className="panel overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <form onSubmit={submit} noValidate className="space-y-6 p-5 sm:p-7">
          <div>
            <h2 id="send-title" className="text-lg font-semibold">
              Send this survey by email
            </h2>
            <p className="mt-1 text-sm text-muted">TapTruly emails your customers for you, from your business name. No helpdesk or signature needed.</p>
          </div>
          <div ref={noticeRef} tabIndex={-1} aria-live="polite" className="outline-none">
            {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
          </div>

          <fieldset disabled={busy} className="space-y-6">
            {/* Who */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label htmlFor="recipients" className="text-sm font-semibold">
                  Who should get it?
                </label>
                <div className="flex gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) readFile(f);
                    }}
                  />
                  <button type="button" className="btn btn-secondary btn-sm min-h-10" onClick={() => fileRef.current?.click()}>
                    <IconUpload className="h-4 w-4" />
                    Upload CSV
                  </button>
                </div>
              </div>
              <textarea
                id="recipients"
                className="input min-h-[9rem] font-mono text-[13px]"
                placeholder={"amaya@gmail.com\nRuwan Silva <ruwan@company.lk>\nor paste a CSV with email, name, agent, ticket columns"}
                value={raw}
                onChange={(e) => {
                  setRaw(e.target.value);
                  setFileName("");
                }}
                spellCheck={false}
                aria-invalid={errors.recipients ? "true" : undefined}
                aria-describedby="recipients-summary"
              />
              <div id="recipients-summary" className="text-[13px]" aria-live="polite">
                {errors.recipients ? (
                  <p className="font-medium text-neg-text">{errors.recipients}</p>
                ) : raw.trim() ? (
                  <p className="text-muted">
                    <span className="font-semibold text-ink">{n(count)} {count === 1 ? "person" : "people"} ready</span>
                    {fileName && ` from ${fileName}`}
                    {parsed.duplicates > 0 && ` · ${n(parsed.duplicates)} duplicates removed`}
                    {parsed.problems.length > 0 && ` · ${n(parsed.problems.length)} lines skipped`}
                    {parsed.tooMany && ` · only the first ${n(SEND_MAX_RECIPIENTS)} are used`}
                  </p>
                ) : (
                  <p className="text-muted">One per line, or a CSV. Up to {n(SEND_MAX_RECIPIENTS)} people per send. Columns named agent and ticket are kept with each rating.</p>
                )}
              </div>
              {parsed.problems.length > 0 && (
                <details className="rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px]">
                  <summary className="cursor-pointer font-semibold">Show skipped lines</summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {parsed.problems.slice(0, 50).map((p) => (
                      <li key={p.line}>
                        Line {p.line}: <span className="text-muted">{p.text || "(empty)"}</span> — {p.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            {/* What */}
            <div className="space-y-4">
              <Field label="Subject line" name="subject" error={errors.subject}>
                <TextInput name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} error={errors.subject} />
              </Field>
              <div className="space-y-1.5">
                <label htmlFor="intro" className="block text-sm font-semibold">
                  Message above the buttons
                </label>
                <textarea
                  id="intro"
                  className="input"
                  rows={4}
                  value={intro}
                  maxLength={1000}
                  onChange={(e) => setIntro(e.target.value)}
                  aria-invalid={errors.intro ? "true" : undefined}
                  aria-describedby={errors.intro ? "intro-error" : "intro-hint"}
                />
                {errors.intro ? (
                  <p id="intro-error" className="text-[13px] font-medium text-neg-text">
                    {errors.intro}
                  </p>
                ) : (
                  <p id="intro-hint" className="text-[13px] text-muted">
                    <code className="rounded bg-canvas px-1">{"{name}"}</code> becomes each person&rsquo;s first name, <code className="rounded bg-canvas px-1">{"{business}"}</code> your business name.
                  </p>
                )}
              </div>
            </div>

            {/* How */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reminder" name="reminder" hint="Only to people who haven't rated yet.">
                <select id="reminder" className="input" value={reminder} onChange={(e) => setReminder(e.target.value as typeof reminder)} aria-describedby="reminder-hint">
                  <option value="">No reminder</option>
                  <option value="3">One reminder after 3 days</option>
                  <option value="5">One reminder after 5 days</option>
                  <option value="7">One reminder after 7 days</option>
                </select>
              </Field>
              <Field label="Don't email the same person twice" name="skipRecent" hint="Avoids asking too often.">
                <select id="skipRecent" className="input" value={skipRecent} onChange={(e) => setSkipRecent(e.target.value as typeof skipRecent)} aria-describedby="skipRecent-hint">
                  <option value="30">Skip anyone emailed in the last 30 days</option>
                  <option value="60">Skip anyone emailed in the last 60 days</option>
                  <option value="90">Skip anyone emailed in the last 90 days</option>
                  <option value="0">Email everyone on the list</option>
                </select>
              </Field>
              <Field label="Send it again" name="repeat" hint="To the same list, so you can track how people feel over time.">
                <select id="repeat" className="input" value={repeat} disabled={!repeatsAllowed} onChange={(e) => setRepeat(e.target.value as typeof repeat)} aria-describedby="repeat-hint">
                  <option value="">Just once</option>
                  <option value="30">Every month</option>
                  <option value="60">Every 2 months</option>
                  <option value="90">Every 3 months</option>
                </select>
                {!repeatsAllowed && <p className="mt-1 text-[13px] text-muted">Repeat sends come with any paid plan.</p>}
              </Field>
              <Field label="Replies go to" name="replyTo" optional error={errors.replyTo} hint="Your support or sales inbox.">
                <TextInput name="replyTo" type="email" inputMode="email" autoComplete="email" placeholder="help@yourbusiness.lk" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} maxLength={254} error={errors.replyTo} hasHint />
              </Field>
              <Field label="Name for this send" name="sendName" error={errors.name} hint="Only your team sees it.">
                <TextInput name="sendName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} error={errors.name} hasHint />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" aria-invalid={errors.confirmCustomers ? "true" : undefined} />
              <span className="text-sm">
                <span className="font-semibold">These are my customers, and they&rsquo;d expect to hear from my business.</span>
                <span className="block text-[13px] text-muted">Every email has an unsubscribe link. People who unsubscribe or whose address bounces are never emailed again.</span>
                {errors.confirmCustomers && <span className="block text-[13px] font-medium text-neg-text">{errors.confirmCustomers}</span>}
              </span>
            </label>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            {myEmail && (
              <button type="button" className="btn btn-secondary min-h-11" disabled={busy} onClick={sendTest}>
                Send a test to me
              </button>
            )}
            <button className="btn btn-primary min-h-11" disabled={busy}>
              {busy ? <Busy>Sending…</Busy> : count ? `Send to ${n(count)} ${count === 1 ? "person" : "people"}` : "Send"}
            </button>
            {progress && (
              <div className="min-w-[12rem] flex-1" role="progressbar" aria-label="Sending" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                <div className="h-2 overflow-hidden rounded-full bg-[#e6e8ee]">
                  <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  {n(progress.done)} of {n(progress.total)} sent. Keep this page open.
                </p>
              </div>
            )}
            {!progress && credits !== null && (
              <p className="text-[13px] text-muted">Each rating uses one response from your balance ({n(credits)} left).</p>
            )}
          </div>
        </form>

        {/* Preview */}
        <aside aria-label="Email preview" className="border-t border-line bg-canvas p-5 sm:p-7 lg:border-l lg:border-t-0">
          <p className="mb-3 text-sm font-semibold text-muted">What {sample.split(" ")[0]} will see</p>
          <div className="overflow-hidden rounded-[14px] border border-line bg-white">
            <div className="border-b border-line bg-[#f8fafc] px-4 py-3">
              <p className="truncate text-[13px] font-semibold">{subject || "Subject line"}</p>
              <p className="text-[12px] text-muted">From your business name</p>
            </div>
            <div className="space-y-3 px-4 py-4 text-[14px] leading-relaxed text-[#1f2937]">
              {fillPlaceholders(intro, sample, "your business")
                .split(/\n{2,}/)
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {p}
                  </p>
                ))}
              <EmailButtonsPreview iconSet={survey.iconSet} question={survey.question} options={options} lang={survey.language} />
              <p className="text-[12px] text-muted">Just tap the one that fits. That&rsquo;s it.</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-muted">The footer includes an unsubscribe link, as the law and email providers require.</p>
        </aside>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function History({ survey, list, canSend, onChanged }: { survey: Survey; list: SendList | null; canSend: boolean; onChanged: () => void }) {
  if (!list) return <PageLoader className="h-40" />;
  if (list.sends.length === 0) {
    return (
      <section className="panel p-5 text-sm text-muted sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-ink">Sent emails</h2>
        Nothing sent yet. Sends you make for &ldquo;{survey.name}&rdquo; appear here with how many people rated.
      </section>
    );
  }
  return (
    <section aria-labelledby="history-title" className="space-y-3">
      <h2 id="history-title" className="text-lg font-semibold">
        Sent emails
      </h2>
      <ul className="space-y-3">
        {list.sends.map((s) => (
          <SendRow key={s.id} s={s} canSend={canSend} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function SendRow({ s, canSend, onChanged }: { s: SendItem; canSend: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Recipient[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const delivered = s.sent;
  const rate = delivered ? Math.round((s.rated / delivered) * 100) : null;
  const going = s.queued > 0;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !people) {
      const r = await api<{ recipients: Recipient[] }>(`/api/sends/${encodeURIComponent(s.id)}`);
      if (r.ok) setPeople(r.data.recipients);
      else setMsg(r.message);
    }
  }

  async function resume() {
    setBusy(true);
    setMsg("");
    let remaining = s.queued;
    while (remaining > 0) {
      const r = await api<ProcessResult>(`/api/sends/${encodeURIComponent(s.id)}/process`, { method: "POST" });
      if (!r.ok) {
        setMsg(r.message);
        break;
      }
      if (r.data.notConfigured) {
        setMsg("Email isn't set up on this server yet (RESEND_API_KEY).");
        break;
      }
      remaining = r.data.remaining;
      if (r.data.sent + r.data.failed === 0) break;
    }
    setBusy(false);
    onChanged();
  }

  async function stop() {
    if (!(await confirmDialog({ title: "Stop this send?", body: `The ${n(s.queued)} emails that haven't gone out yet won't be sent, and no reminder will go out.`, confirmLabel: "Stop send", danger: true }))) return;
    const r = await api(`/api/sends/${encodeURIComponent(s.id)}`, { method: "DELETE" });
    if (!r.ok) setMsg(r.message);
    onChanged();
  }

  const stat = (label: string, value: string, sub?: string) => (
    <div className="min-w-[6.5rem]">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="font-display text-xl font-bold tabular leading-tight">{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );

  return (
    <li className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {s.name}
            {going ? <Badge tone="brand">Sending</Badge> : s.source === "api" ? <Badge tone="plain">From the API</Badge> : null}
          </p>
          <p className="text-[13px] text-muted">
            {fmtDate(s.createdAt)} · &ldquo;{s.subject}&rdquo;
          </p>
        </div>
        {canSend && going && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm min-h-10" disabled={busy} onClick={resume}>
              {busy ? <Busy>Sending…</Busy> : "Continue sending"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm min-h-10" disabled={busy} onClick={stop}>
              Stop
            </button>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        {stat("Sent", n(s.sent), going ? `${n(s.queued)} still to go` : undefined)}
        {stat("Rated", n(s.rated), rate !== null ? `${rate}% of sent` : undefined)}
        {stat("Reminder", s.reminderDays ? n(s.reminded) : "Off", s.reminderDays ? `after ${s.reminderDays} days` : undefined)}
        {s.repeatDays && stat("Repeats", `${s.repeatDays === 30 ? "Monthly" : `Every ${s.repeatDays / 30} months`}`, s.nextRunAt ? `next ${new Date(s.nextRunAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : undefined)}
        {s.skippedRecent + s.suppressed > 0 && stat("Skipped", n(s.skippedRecent + s.suppressed), `${n(s.skippedRecent)} recent · ${n(s.suppressed)} unsubscribed`)}
        {s.failed > 0 && stat("Not delivered", n(s.failed))}
      </div>
      {msg && (
        <div className="mt-3">
          <Notice kind="error">{msg}</Notice>
        </div>
      )}
      {canSend && s.repeatDays && (
        <button
          type="button"
          className="mr-4 mt-4 text-[13px] font-semibold text-muted hover:text-ink hover:underline"
          onClick={async () => {
            if (!(await confirmDialog({ title: "Stop repeating this send?", body: "Sends already made stay as they are; no new ones will go out.", confirmLabel: "Stop repeating" }))) return;
            const r = await api(`/api/sends/${encodeURIComponent(s.id)}`, { method: "PATCH", body: { repeatDays: null } });
            if (!r.ok) setMsg(r.message);
            onChanged();
          }}
        >
          Stop repeating
        </button>
      )}
      <button type="button" className="mt-4 text-[13px] font-semibold text-brand hover:underline" aria-expanded={open} onClick={toggle}>
        {open ? "Hide people" : `Show people (${n(s.total)})`}
      </button>
      {open && (
        <div className="mt-3 max-h-80 overflow-auto rounded-[10px] border border-line">
          {!people ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-[#f8fafc] text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Customer</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Rated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <span className="block font-medium">{p.name ?? "—"}</span>
                      <span className="text-muted">{p.email}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_LABEL[p.status]?.tone ?? "plain"}>{STATUS_LABEL[p.status]?.text ?? p.status}</Badge>
                      {p.remindedAt && <span className="ml-1 text-muted">+ reminder</span>}
                    </td>
                    <td className="px-3 py-2">{p.rated ? <Badge tone="pos">Rated</Badge> : <span className="text-muted">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}
