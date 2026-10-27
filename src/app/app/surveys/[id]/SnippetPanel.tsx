"use client";
import { useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import type { SnippetResponse } from "@/lib/client/types";
import { MERGE_PRESETS } from "@/lib/surveys/snippet";
import { Notice, Skeleton } from "@/components/ui";
import { EmailFrame } from "@/components/SurveyPreview";
import { IconCheck, IconCopy } from "@/components/icons";

type PresetId = keyof typeof MERGE_PRESETS | "custom";

const PRESETS: Array<{ id: PresetId; label: string; tracks: string }> = [
  { id: "signature", label: "Gmail / Outlook signature", tracks: "Tracks the rating and the device. Customer names aren't included." },
  { id: "zendesk", label: "Zendesk", tracks: "Adds customer email, agent and ticket number automatically." },
  { id: "freshdesk", label: "Freshdesk", tracks: "Adds customer email, agent and ticket number automatically." },
  { id: "hubspot", label: "HubSpot", tracks: "Adds contact email, owner and ticket automatically." },
  { id: "mailchimp", label: "Mailchimp", tracks: "Adds the subscriber's email automatically." },
  { id: "custom", label: "Other tool", tracks: "Use your tool's merge tags for customer, agent and ticket." },
];

const HOW_TO: Record<PresetId, string[]> = {
  signature: [
    "Gmail: Settings → See all settings → General → Signature. Paste, then Save changes at the bottom.",
    "Outlook: Settings → Account → Signatures. Paste and save.",
  ],
  zendesk: ["Admin Center → Objects and rules → Triggers. Open “Notify requester of solved request”, paste into the email body (HTML), save."],
  freshdesk: ["Admin → Email notifications → “Agent solves the ticket”. Switch the editor to code view, paste, save."],
  hubspot: ["Open your ticket-closed email template, add a Rich text module, switch to source code, paste."],
  mailchimp: ["Add a Code block to your campaign or automation email and paste."],
  custom: ["Paste into your email template's HTML or code view, where merge tags are supported."],
};

export function SnippetPanel({ surveyId }: { surveyId: string }) {
  const [preset, setPreset] = useState<PresetId>("signature");
  const [custom, setCustom] = useState({ email: "", agent: "", ticket: "" });
  const [snippet, setSnippet] = useState<SnippetResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"" | "rich" | "html">("");

  useEffect(() => {
    setSnippet(null);
    const t = setTimeout(() => {
      const extra = preset === "custom" ? custom : {};
      // Links are signed on the server; the signing secret never reaches the browser.
      api<SnippetResponse>(`/api/surveys/${encodeURIComponent(surveyId)}/snippet${qs({ preset, ...extra })}`).then((r) => {
        if (r.ok) {
          setSnippet(r.data);
          setError("");
        } else setError(Object.values(r.fields ?? {})[0] ?? r.message);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [surveyId, preset, custom]);

  async function copy(kind: "rich" | "html") {
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
      setTimeout(() => setCopied(""), 2500);
    } catch {
      setError("Couldn't copy automatically. Open “Show HTML code” below and copy it from there.");
    }
  }

  const active = PRESETS.find((p) => p.id === preset)!;
  const isSignature = preset === "signature";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <ol className="space-y-6">
        <li className="panel p-5 sm:p-6">
          <Step n={1} title="Where do you send from?" />
          <div role="radiogroup" aria-label="Where you send from" className="mt-4 grid gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                onClick={() => setPreset(p.id)}
                className={`min-h-11 rounded-[10px] border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  preset === p.id ? "border-brand bg-brand-soft text-brand" : "border-line hover:border-line-strong"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-muted">{active.tracks}</p>
          {preset === "custom" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(["email", "agent", "ticket"] as const).map((k) => (
                <label key={k} className="space-y-1.5 text-sm">
                  <span className="block font-semibold">{k === "email" ? "Customer email tag" : k === "agent" ? "Agent name tag" : "Ticket ID tag"}</span>
                  <input
                    className="input"
                    maxLength={80}
                    value={custom[k]}
                    placeholder={k === "email" ? "{{customer.email}}" : k === "agent" ? "{{agent.name}}" : "{{ticket.id}}"}
                    onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          )}
        </li>

        <li className="panel p-5 sm:p-6">
          <Step n={2} title="Copy the buttons" />
          <div className="mt-4 space-y-4">
            {error && <Notice kind="error">{error}</Notice>}
            {snippet && !snippet.active && <Notice kind="error">This survey is paused, so clicks will show “survey closed”. Turn it on in Settings.</Notice>}
            <div className="flex flex-wrap gap-2">
              {isSignature ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => copy("rich")} disabled={!snippet}>
                    {copied === "rich" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                    {copied === "rich" ? "Copied" : "Copy buttons"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => copy("html")} disabled={!snippet}>
                    {copied === "html" ? "Copied" : "Copy HTML code"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => copy("html")} disabled={!snippet}>
                    {copied === "html" ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                    {copied === "html" ? "Copied" : "Copy HTML code"}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => copy("rich")} disabled={!snippet}>
                    {copied === "rich" ? "Copied" : "Copy as buttons"}
                  </button>
                </>
              )}
              <span aria-live="polite" className="sr-only">
                {copied ? "Copied to clipboard" : ""}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold">Where to paste</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                {HOW_TO[preset].map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-muted">Show HTML code</summary>
              <textarea readOnly aria-label="Button HTML code" className="input mt-2 h-40 font-mono text-xs" value={snippet?.html ?? ""} />
            </details>
          </div>
        </li>

        <li className="panel p-5 sm:p-6">
          <Step n={3} title="Send yourself a test" />
          <p className="mt-2 text-sm text-muted">
            Email yourself, click a button on your phone, and check that the rating appears on your dashboard. Clicks from email security scanners
            are filtered out automatically, so only real people are counted.
          </p>
        </li>
      </ol>

      <aside className="lg:sticky lg:top-8 lg:self-start" aria-label="How it looks in an email">
        <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal text-muted">How it looks in an email</h2>
        <EmailFrame>
          {snippet ? (
            /* Our own server-generated, fully escaped HTML. Clicks are disabled in the preview. */
            <div className="pointer-events-none" aria-hidden dangerouslySetInnerHTML={{ __html: snippet.html }} />
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </EmailFrame>
      </aside>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand" aria-hidden>
        {n}
      </span>
      <h2 className="text-lg font-semibold">
        <span className="sr-only">Step {n}: </span>
        {title}
      </h2>
    </div>
  );
}
