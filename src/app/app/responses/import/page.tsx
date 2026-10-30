"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { ICON_SETS } from "@/lib/surveys/iconSets";
import { IMPORT_MAX_ROWS } from "@/lib/validation/schemas";
import { IMPORT_FIELDS, IMPORT_MAX_FILE_BYTES, SAMPLE_CSV, checkAll, detectColumns, parseCsv, type ColumnMapping, type ImportField } from "@/lib/csvImport";
import { EmptyState, LoadError, Notice, Skeleton } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { IconArrowLeft, IconDownload, IconUpload } from "@/components/icons";
import { confirmDialog } from "@/components/ConfirmDialog";

type Batch = { id: string; surveyId: string; surveyName: string; fileName: string; rows: number; skipped: number; createdAt: string };
type Loaded = { fileName: string; header: string[]; body: string[][] };

const FIELD_LABEL: Record<ImportField, string> = {
  date: "Date",
  rating: "Rating",
  email: "Customer email",
  comment: "Comment",
  agent: "Agent",
  ticket: "Ticket",
};
const REQUIRED: ImportField[] = ["date", "rating"];

export default function ImportPage() {
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [surveyId, setSurveyId] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchError, setBatchError] = useState("");
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const loadBatches = useCallback(() => {
    setBatchError("");
    api<Batch[]>("/api/imports").then((r) => (r.ok ? setBatches(r.data) : setBatchError(r.message)));
  }, []);

  useEffect(() => {
    api<{ role: string | null }>("/api/account").then((r) => setAllowed(r.ok && (r.data.role === "owner" || r.data.role === "admin")));
    api<Survey[]>("/api/surveys").then((r) => {
      if (!r.ok) return setSurveys([]);
      const usable = r.data.filter((s) => s.status !== "archived");
      setSurveys(usable);
      if (usable[0]) setSurveyId((cur) => cur || usable[0]!.id);
    });
    loadBatches();
  }, [loadBatches]);

  const survey = surveys?.find((s) => s.id === surveyId) ?? null;
  const missing = REQUIRED.filter((f) => mapping[f] === undefined);
  const check = useMemo(() => (loaded && survey && missing.length === 0 ? checkAll(loaded.body, mapping, survey.iconSet) : null), [loaded, survey, mapping, missing.length]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setFileError("");
    setResult(null);
    setLoaded(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) return setFileError("Choose a .csv file. In Excel or Google Sheets: File → Download / Save as → CSV.");
    if (file.size > IMPORT_MAX_FILE_BYTES) return setFileError("The file is larger than 2 MB. Split it into smaller files.");
    const text = await file.text();
    if (text.includes("\u0000")) return setFileError("That doesn't look like a text CSV file.");
    const { rows, truncated } = parseCsv(text);
    if (truncated || rows.length - 1 > IMPORT_MAX_ROWS) return setFileError(`Up to ${IMPORT_MAX_ROWS.toLocaleString()} ratings per file. Split it into smaller files.`);
    const [header, ...body] = rows;
    if (!header || body.length === 0) return setFileError("The file needs a header row and at least one rating.");
    setLoaded({ fileName: file.name.slice(0, 120), header: header.map((h) => h.trim().slice(0, 60)), body });
    setMapping(detectColumns(header));
  }

  async function runImport() {
    if (!check || !survey || !loaded || check.valid.length === 0) return;
    setBusy(true);
    setResult(null);
    const r = await api<{ inserted: number; skipped: number }>(`/api/surveys/${encodeURIComponent(survey.id)}/import`, {
      method: "POST",
      body: { fileName: loaded.fileName, rows: check.valid },
    });
    setBusy(false);
    if (r.ok) {
      setResult({
        kind: "success",
        text: `Imported ${r.data.inserted.toLocaleString()} rating${r.data.inserted === 1 ? "" : "s"} into “${survey.name}”.${r.data.skipped ? ` ${r.data.skipped.toLocaleString()} were already there and were skipped.` : ""}`,
      });
      setLoaded(null);
      loadBatches();
    } else setResult({ kind: "error", text: r.message });
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "taptruly-import-sample.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (allowed === false) {
    return <EmptyState title="Only owners and admins can import ratings" body="Ask an owner or admin on your team to do it." />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/app/responses" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft className="h-4 w-4" />
          Responses
        </Link>
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Import past ratings</h1>
          <p className="text-sm text-muted">Bring in ratings from a spreadsheet or another tool, so your reports start with your history.</p>
        </div>
      </header>

      {result && <Notice kind={result.kind}>{result.text}</Notice>}

      <details className="panel group p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
          Moving from Delighted, Customer Thermometer or another tool?
          <span aria-hidden className="text-xl font-normal text-muted transition-transform group-open:rotate-45">+</span>
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>Download your responses as a CSV from the old tool (in Delighted: Results → Export → CSV).</li>
          <li>Create a survey here with the same scale: 0–10 for NPS, 5 stars or faces for CSAT.</li>
          <li>Choose that survey and the file below. Common column names (Score, Comment, Response timestamp, Person email) are matched for you, and Unix times work too.</li>
          <li>Import one file per survey. Importing the same file twice is safe: repeated rows are skipped.</li>
        </ol>
      </details>

      <SettingsSection title="1. Choose the survey and file" description="Imported ratings don't use credits, open follow-ups or send alerts.">
        {!surveys ? (
          <Skeleton className="h-24 w-full" />
        ) : surveys.length === 0 ? (
          <EmptyState title="Create a survey first" body="Ratings are imported into a survey, so its scale is used for your reports." />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="imp-survey" className="block text-sm font-semibold">
                Survey
              </label>
              <select id="imp-survey" className="input w-auto min-w-56 max-w-full" value={surveyId} onChange={(e) => setSurveyId(e.target.value)}>
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({ICON_SETS[s.iconSet].name}, {ICON_SETS[s.iconSet].min}–{ICON_SETS[s.iconSet].max})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="imp-file" className="block text-sm font-semibold">
                CSV file
              </label>
              <input id="imp-file" type="file" accept=".csv,text/csv" onChange={onFile} className="block text-sm file:mr-3 file:min-h-11 file:rounded-[10px] file:border file:border-line file:bg-white file:px-4 file:font-semibold" />
              <p className="text-[13px] text-muted">
                Columns: <strong>date</strong> and <strong>rating</strong> are required; email, comment, agent and ticket are optional. Dates like 2025-03-14 or 2025-03-14 09:30
                (your computer&rsquo;s time zone). Up to {IMPORT_MAX_ROWS.toLocaleString()} rows, 2 MB.{" "}
                <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand underline" onClick={downloadSample}>
                  <IconDownload className="h-3.5 w-3.5" />
                  Sample file
                </button>
              </p>
              {fileError && <Notice kind="error">{fileError}</Notice>}
            </div>
          </div>
        )}
      </SettingsSection>

      {loaded && survey && (
        <SettingsSection title="2. Check the columns" description={`${loaded.fileName}: ${loaded.body.length.toLocaleString()} rows`}>
          <div className="grid gap-3 sm:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f} className="space-y-1">
                <label htmlFor={`map-${f}`} className="block text-sm font-semibold">
                  {FIELD_LABEL[f]}
                  {!REQUIRED.includes(f) && <span className="ml-1 font-normal text-muted">(optional)</span>}
                </label>
                <select
                  id={`map-${f}`}
                  className="input"
                  value={mapping[f] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                >
                  <option value="">{REQUIRED.includes(f) ? "Choose a column" : "Not in file"}</option>
                  {loaded.header.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {missing.length > 0 && (
            <div className="mt-4">
              <Notice kind="info">Choose the {missing.map((m) => FIELD_LABEL[m].toLowerCase()).join(" and ")} column.</Notice>
            </div>
          )}

          {check && (
            <div className="mt-5 space-y-4">
              <p className="text-sm">
                <strong>{check.valid.length.toLocaleString()}</strong> ready to import
                {check.problems.length > 0 && (
                  <>
                    , <strong className="text-neg-text">{check.problems.length.toLocaleString()}</strong> with problems (they&rsquo;ll be left out)
                  </>
                )}
              </p>
              {check.problems.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[10px] bg-canvas p-3 text-[13px]">
                  {check.problems.slice(0, 50).map((p) => (
                    <li key={p.line}>
                      <span className="font-semibold">Line {p.line}:</span> {p.message}
                    </li>
                  ))}
                  {check.problems.length > 50 && <li className="text-muted">…and {check.problems.length - 50} more</li>}
                </ul>
              )}
              {check.valid.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <caption className="mb-1 text-left text-muted">First rows</caption>
                    <thead>
                      <tr className="border-b border-line">
                        {IMPORT_FIELDS.map((f) => (
                          <th key={f} scope="col" className="py-1.5 pr-3 font-semibold">
                            {FIELD_LABEL[f]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {check.valid.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-b border-line align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.date).toLocaleString()}</td>
                          <td className="py-1.5 pr-3">{r.rating}</td>
                          <td className="py-1.5 pr-3">{r.email ?? ""}</td>
                          <td className="max-w-40 truncate py-1.5 pr-3 sm:max-w-56">{r.comment ?? ""}</td>
                          <td className="py-1.5 pr-3">{r.agent ?? ""}</td>
                          <td className="py-1.5 pr-3">{r.ticket ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button type="button" className="btn btn-primary" disabled={busy || check.valid.length === 0} onClick={runImport}>
                <IconUpload className="h-4 w-4" />
                {busy ? <Busy>Importing…</Busy> : `Import ${check.valid.length.toLocaleString()} rating${check.valid.length === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </SettingsSection>
      )}

      <SettingsSection title="Past imports" description="Undo removes exactly the ratings an import added.">
        {batchError && <LoadError message={batchError} onRetry={loadBatches} />}
        {!batches && !batchError && <Skeleton className="h-16 w-full" />}
        {batches && batches.length === 0 && <p className="text-sm text-muted">Nothing imported yet.</p>}
        {batches && batches.length > 0 && (
          <ul className="divide-y divide-line">
            {batches.map((b) => (
              <BatchRow key={b.id} batch={b} onChanged={loadBatches} />
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}

function BatchRow({ batch, onChanged }: { batch: Batch; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function undo() {
    if (!(await confirmDialog({ title: "Undo this import?", body: `The ${batch.rows.toLocaleString()} ratings imported from “${batch.fileName}” will be removed. This can't be undone.`, confirmLabel: "Undo import", danger: true }))) return;
    setBusy(true);
    const r = await api(`/api/imports/${batch.id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onChanged();
    else setMsg(r.message);
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{batch.fileName}</p>
        <p className="text-[13px] text-muted">
          {batch.rows.toLocaleString()} ratings into {batch.surveyName}
          {batch.skipped ? `, ${batch.skipped.toLocaleString()} skipped as duplicates` : ""}, {new Date(batch.createdAt).toLocaleDateString()}
        </p>
        {msg && <p className="text-[13px] font-medium text-neg-text">{msg}</p>}
      </div>
      <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={undo}>
        Undo import
      </button>
    </li>
  );
}
