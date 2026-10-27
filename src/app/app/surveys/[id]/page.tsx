"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, qs } from "@/lib/client/api";
import type { ResponsesPage, SnippetResponse, Survey } from "@/lib/client/types";
import { SurveyForm } from "@/components/SurveyForm";
import { FormMessage } from "@/components/ui";
import { MERGE_PRESETS } from "@/lib/surveys/snippet";

const PRESETS = [...Object.entries(MERGE_PRESETS).map(([id, p]) => ({ id, label: p.label })), { id: "custom", label: "Custom merge tags" }];

export default function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [hasResponses, setHasResponses] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Survey>(`/api/surveys/${encodeURIComponent(id)}`).then((r) => (r.ok ? setSurvey(r.data) : setError(r.message)));
    api<ResponsesPage>(`/api/responses${qs({ surveyId: id, limit: 1 })}`).then((r) => r.ok && setHasResponses(r.data.total > 0));
  }, [id]);

  if (error) return <FormMessage kind="error">{error}</FormMessage>;
  if (!survey) return <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{survey.name}</h1>
        <button
          className="btn btn-danger"
          onClick={async () => {
            if (!window.confirm("Archive this survey? Buttons already sent in emails will show “survey closed”. Responses are kept.")) return;
            const r = await api(`/api/surveys/${encodeURIComponent(id)}`, { method: "DELETE" });
            if (r.ok) router.push("/app/surveys");
            else setError(r.message);
          }}
        >
          Archive
        </button>
      </div>

      <SnippetPanel surveyId={survey.id} key={survey.updatedAt} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Settings</h2>
        <SurveyForm
          initial={survey}
          hasResponses={hasResponses}
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
      </section>
    </div>
  );
}

function SnippetPanel({ surveyId }: { surveyId: string }) {
  const [preset, setPreset] = useState("signature");
  const [custom, setCustom] = useState({ email: "", agent: "", ticket: "" });
  const [snippet, setSnippet] = useState<SnippetResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const extra = preset === "custom" ? custom : {};
      api<SnippetResponse>(`/api/surveys/${encodeURIComponent(surveyId)}/snippet${qs({ preset, ...extra })}`).then((r) => {
        if (r.ok) {
          setSnippet(r.data);
          setError("");
        } else setError(Object.values(r.fields ?? {})[0] ?? r.message);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [surveyId, preset, custom]);

  async function copy(kind: "html" | "rich") {
    if (!snippet) return;
    try {
      if (kind === "rich" && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([snippet.html], { type: "text/html" }),
            "text/plain": new Blob([snippet.html], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(snippet.html);
      }
      setCopied(kind);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Copy failed. Select the HTML below and copy it manually.");
    }
  }

  return (
    <section className="panel space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">Add the buttons to your emails</h2>
        <p className="text-sm text-[var(--muted)]">Pick where you send from. Helpdesk presets fill in the customer, agent and ticket automatically.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn ${preset === p.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="grid gap-3 md:grid-cols-3">
          {(["email", "agent", "ticket"] as const).map((k) => (
            <label key={k} className="space-y-1 text-sm">
              <span className="font-medium capitalize">{k} merge tag</span>
              <input
                className="input"
                maxLength={80}
                value={custom[k]}
                placeholder={k === "email" ? "{{customer.email}}" : ""}
                onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
      )}

      <FormMessage kind="error">{error}</FormMessage>

      {snippet && (
        <>
          {!snippet.active && <FormMessage kind="error">This survey is not active, so clicks will show “survey closed”.</FormMessage>}
          <div className="rounded-lg border border-dashed border-[var(--line)] bg-white p-4">
            {/* Preview: our own server-generated, escaped HTML. Links are disabled in the preview. */}
            <div className="pointer-events-none" dangerouslySetInnerHTML={{ __html: snippet.html }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => copy("rich")}>
              {copied === "rich" ? "Copied!" : "Copy for Gmail / Outlook signature"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => copy("html")}>
              {copied === "html" ? "Copied!" : "Copy HTML (helpdesk templates)"}
            </button>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-[var(--muted)]">Show HTML</summary>
            <textarea readOnly className="input mt-2 h-40 font-mono text-xs" value={snippet.html} />
          </details>
        </>
      )}
    </section>
  );
}
