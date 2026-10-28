"use client";
import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, qs } from "@/lib/client/api";
import type { ResponsesPage, Survey } from "@/lib/client/types";
import { SurveyForm } from "@/components/SurveyForm";
import { Badge, LoadError, Notice, Skeleton } from "@/components/ui";
import { IconArrowLeft } from "@/components/icons";
import { SnippetPanel } from "./SnippetPanel";
import { CollectPanel } from "./CollectPanel";
import { IconCustomizer } from "./IconCustomizer";
import { confirmDialog } from "@/components/ConfirmDialog";

type Tab = "buttons" | "collect" | "settings";

function SurveyDetail({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const created = search.get("created") === "1";
  const iconsFailed = Math.min(11, Math.max(0, Number(search.get("iconsFailed") ?? 0) || 0));
  const initialTab = search.get("tab");
  const [tab, setTab] = useState<Tab>(initialTab === "settings" || initialTab === "collect" ? initialTab : "buttons");
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [hasResponses, setHasResponses] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [error, setError] = useState("");
  const [archiveError, setArchiveError] = useState("");

  const load = useCallback(() => {
    setError("");
    api<Survey>(`/api/surveys/${encodeURIComponent(id)}`).then((r) => (r.ok ? setSurvey(r.data) : setError(r.message)));
    api<ResponsesPage>(`/api/responses${qs({ surveyId: id, limit: 1 })}`).then((r) => r.ok && setHasResponses(r.data.total > 0));
    api<{ role: string | null }>("/api/account").then((r) => r.ok && setCanEdit(r.data.role === "owner" || r.data.role === "admin"));
  }, [id]);
  useEffect(load, [load]);

  function switchTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    if (next !== "buttons") url.searchParams.set("tab", next);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  }

  async function archive() {
    if (!(await confirmDialog({ title: "Archive this survey?", body: "Buttons already sent in emails will show “survey closed”. Ratings you've collected are kept.", confirmLabel: "Archive", danger: true }))) return;
    const r = await api(`/api/surveys/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) router.push("/app/surveys");
    else setArchiveError(r.message);
  }

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!survey) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-[var(--radius-panel)]" />
      </div>
    );
  }

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "buttons", label: "Add to emails" },
    { value: "collect", label: "QR, WhatsApp & more" },
    { value: "settings", label: "Settings" },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/app/surveys" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft className="h-4 w-4" />
          Surveys
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[28px] font-bold leading-tight">{survey.name}</h1>
              {survey.status === "active" ? <Badge tone="pos">Active</Badge> : <Badge tone="plain">Paused</Badge>}
            </div>
            <p className="text-sm text-muted">{survey.question}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/app/responses${qs({ surveyId: survey.id })}`} className="btn btn-secondary">
              View ratings
            </Link>
            {canEdit && (
              <button type="button" className="btn btn-danger" onClick={archive}>
                Archive
              </button>
            )}
          </div>
        </div>
        {archiveError && <Notice kind="error">{archiveError}</Notice>}
        {created && <Notice kind="success">Survey created. Now add the buttons to your emails.</Notice>}
        {iconsFailed > 0 && (
          <Notice kind="error">
            {iconsFailed === 1 ? "One picture" : `${iconsFailed} pictures`} couldn&rsquo;t be uploaded. Add {iconsFailed === 1 ? "it" : "them"} again below in &ldquo;Your own pictures and labels&rdquo;.
          </Notice>
        )}
      </header>

      <div role="tablist" aria-label="Survey sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            id={`tab-${t.value}`}
            aria-selected={tab === t.value}
            aria-controls={`panel-${t.value}`}
            onClick={() => switchTab(t.value)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${
              tab === t.value ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "buttons" ? (
          <SnippetPanel surveyId={survey.id} key={survey.updatedAt} />
        ) : tab === "collect" ? (
          <CollectPanel surveyId={survey.id} surveyName={survey.name} canEdit={canEdit} />
        ) : (
          <div className="space-y-6">
          <SurveyForm
            initial={survey}
            hasResponses={hasResponses}
            canEdit={canEdit}
            submitLabel="Save changes"
            onSubmit={async (values) => {
              const res = await api<Survey>(`/api/surveys/${encodeURIComponent(id)}`, { method: "PATCH", body: values });
              if (res.ok) {
                setSurvey(res.data);
                return { ok: true };
              }
              return { ok: false, message: res.message, fields: res.fields };
            }}
          />
          <IconCustomizer key={survey.updatedAt} survey={survey} canEdit={canEdit} onChanged={load} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <SurveyDetail id={id} />
    </Suspense>
  );
}
