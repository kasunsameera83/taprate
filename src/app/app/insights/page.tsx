"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import type { InsightResult } from "@/lib/insights/ai";
import { Badge, EmptyState, LoadError, Notice, Segmented } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { IconDownload, IconSparkle } from "@/components/icons";
import { PageLoader, Busy } from "@/components/FaceLoader";
import { PaidFeatureNotice, useAllows } from "@/components/PlanContext";

type Item = { id: string; surveyId: string | null; surveyName: string | null; days: number; periodStart: string; periodEnd: string; commentCount: number; ratingCount: number; result: InsightResult; createdAt: string };
type List = { enabled: boolean; configured: boolean; items: Item[] };
type Days = 7 | 30 | 90;

const TONE: Record<string, "pos" | "neg" | "neu"> = { positive: "pos", negative: "neg", mixed: "neu" };
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function InsightsPage() {
  const aiAllowed = useAllows("ai");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [surveyId, setSurveyId] = useState("");
  const [days, setDays] = useState<Days>(30);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setError("");
    api<List>(`/api/insights${qs({ surveyId: surveyId || undefined })}`).then((r) => (r.ok ? setList(r.data) : setError(r.message)));
  }, [surveyId]);
  useEffect(() => {
    api<Survey[]>("/api/surveys").then((r) => r.ok && setSurveys(r.data.filter((s) => s.status !== "archived")));
    api<{ role: string | null }>("/api/account").then((r) => r.ok && setRole(r.data.role));
  }, []);
  useEffect(load, [load]);

  const canGenerate = role === "owner" || role === "admin";
  const isOwner = role === "owner";
  const current = list?.items.find((i) => i.id === selected) ?? list?.items[0] ?? null;

  async function generate() {
    setBusy(true);
    setMsg({ kind: "info", text: "Reading your customers' comments… this takes up to a minute." });
    const r = await api<{ id: string; sampled: boolean }>("/api/insights", { method: "POST", body: { surveyId: surveyId || null, days } });
    setBusy(false);
    if (r.ok) {
      setMsg(r.data.sampled ? { kind: "info", text: "Done. There were a lot of comments, so the summary is based on the most recent 300." } : null);
      setSelected(r.data.id);
      load();
    } else setMsg({ kind: "error", text: r.message });
  }

  async function setEnabled(enabled: boolean) {
    if (enabled) {
      const ok = await confirmDialog({
        title: "Turn on AI summaries?",
        body: "When someone makes a summary, your customers' comments (with email addresses and phone numbers removed) are sent to Anthropic's Claude AI to be summarised. Anthropic doesn't use API data to train its models. You can turn this off at any time.",
        confirmLabel: "Turn on",
      });
      if (!ok) return;
    }
    const r = await api("/api/account/ai", { method: "PATCH", body: { enabled } });
    if (r.ok) load();
    else setMsg({ kind: "error", text: r.message });
  }

  const printHref = `/app/reports/print${qs({ surveyId: surveyId || undefined, days })}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Insights</h1>
          <p className="text-sm text-muted">What customers are saying, in plain words, and what to do about it.</p>
        </div>
        <Link href={printHref} className="btn btn-secondary">
          <IconDownload className="h-4 w-4" />
          PDF report
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="ins-survey" className="sr-only">
          Survey
        </label>
        <select id="ins-survey" className="input w-auto min-w-44 max-w-full" value={surveyId} onChange={(e) => { setSurveyId(e.target.value); setSelected(null); }}>
          <option value="">All surveys</option>
          {surveys.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Segmented label="Period" value={days} onChange={setDays} options={[{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }]} />
      </div>

      {error && <LoadError message={error} onRetry={load} />}
      {!list && !error && <PageLoader className="h-64" />}

      {list && (
        <SettingsSection title="AI summary" description="Themes, real quotes and suggested actions from your customers' comments.">
          {!aiAllowed ? (
            <PaidFeatureNotice feature="ai" />
          ) : !list.configured ? (
            <Notice kind="info">AI summaries aren&rsquo;t set up on this server yet (ANTHROPIC_API_KEY).</Notice>
          ) : !list.enabled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">AI summaries are off for this business.</p>
              {isOwner ? (
                <button type="button" className="btn btn-primary" onClick={() => setEnabled(true)}>
                  <IconSparkle className="h-4 w-4" />
                  Turn on AI summaries
                </button>
              ) : (
                <p className="text-sm text-muted">Ask the business owner to turn them on.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {canGenerate && (
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={generate}>
                    <IconSparkle className="h-4 w-4" />
                    {busy ? <Busy>Summarising…</Busy> : `Summarise the last ${days} days`}
                  </button>
                  {isOwner && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEnabled(false)}>
                      Turn off AI summaries
                    </button>
                  )}
                </div>
              )}
              {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
              {!current ? (
                <EmptyState title="No summaries yet" body={canGenerate ? "Make your first one above." : "An owner or admin can make one."} />
              ) : (
                <Summary item={current} />
              )}
            </div>
          )}
        </SettingsSection>
      )}

      {list && list.items.length > 1 && (
        <SettingsSection title="Earlier summaries">
          <ul className="divide-y divide-line">
            {list.items.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => setSelected(i.id)} className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-sm ${current?.id === i.id ? "font-semibold text-brand" : ""}`}>
                  <span className="min-w-0 truncate">{i.result.headline}</span>
                  <span className="text-[13px] text-muted">
                    {i.surveyName ?? "All surveys"} · {i.days} days · {fmt(i.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      <ReportSettings surveys={surveys} aiAvailable={Boolean(list?.enabled && list?.configured)} />
    </div>
  );
}

function Summary({ item }: { item: Item }) {
  const r = item.result;
  return (
    <article className="space-y-4">
      <div>
        <p className="text-[13px] text-muted">
          {item.surveyName ?? "All surveys"} · last {item.days} days · {item.commentCount} comments from {item.ratingCount} ratings · made {fmt(item.createdAt)}
        </p>
        <h3 className="mt-1 text-xl font-bold">{r.headline}</h3>
        <p className="mt-2 whitespace-pre-line text-muted">{r.summary}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {r.themes.map((t, i) => (
          <div key={i} className="rounded-[12px] border border-line p-4">
            <p className="flex flex-wrap items-center justify-between gap-2 font-semibold">
              {t.title}
              <Badge tone={TONE[t.sentiment] ?? "neu"}>
                {t.sentiment === "mixed" ? "Mixed" : t.sentiment === "positive" ? "Positive" : "Negative"} · {t.mentions}
              </Badge>
            </p>
            <p className="mt-1 text-sm text-muted">{t.detail}</p>
            {t.quotes.map((q, j) => (
              <blockquote key={j} className="mt-2 border-l-2 border-line-strong pl-3 text-sm italic">
                &ldquo;{q}&rdquo;
              </blockquote>
            ))}
          </div>
        ))}
      </div>
      <div>
        <h4 className="font-semibold">Suggested actions</h4>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
          {r.actions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ol>
      </div>
      <p className="text-[12px] text-muted">Written by AI from your customers&rsquo; comments. Quotes are checked against the real comments; always use your judgement.</p>
    </article>
  );
}

function ReportSettings({ surveys, aiAvailable }: { surveys: Survey[]; aiAvailable: boolean }) {
  const reportsAllowed = useAllows("reports");
  const [s, setS] = useState<{ frequency: "off" | "weekly" | "monthly"; surveyId: string | null; includeAi: boolean; email: string | null } | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ frequency: "off" | "weekly" | "monthly"; surveyId: string | null; includeAi: boolean; email: string | null }>("/api/reports/settings").then((r) => r.ok && setS(r.data));
  }, []);
  if (!s) return null;
  async function save(next: typeof s) {
    if (!next) return;
    setS(next);
    setBusy(true);
    const r = await api("/api/reports/settings", { method: "PUT", body: { frequency: next.frequency, surveyId: next.surveyId, includeAi: next.includeAi } });
    setBusy(false);
    setMsg(r.ok ? { kind: "success", text: next.frequency === "off" ? "Email reports are off." : `Saved. Reports go to ${next.email ?? "your email"}.` } : { kind: "error", text: r.message });
  }
  return (
    <SettingsSection title="Email me a report" description="A summary of your ratings in your inbox: weekly reports arrive on Monday mornings, monthly ones on the 1st.">
      {!reportsAllowed ? (
        <PaidFeatureNotice feature="reports" />
      ) : (
      <div className="space-y-3">
        <Segmented
          label="How often"
          value={s.frequency}
          onChange={(frequency) => save({ ...s, frequency })}
          options={[{ value: "off", label: "Off" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]}
        />
        {s.frequency !== "off" && (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Survey</span>
              <select className="input w-auto max-w-full" value={s.surveyId ?? ""} disabled={busy} onChange={(e) => save({ ...s, surveyId: e.target.value || null })}>
                <option value="">All surveys</option>
                {surveys.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            {aiAvailable && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={s.includeAi} disabled={busy} onChange={(e) => save({ ...s, includeAi: e.target.checked })} />
                Include an AI summary
              </label>
            )}
          </div>
        )}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </div>
      )}
    </SettingsSection>
  );
}
