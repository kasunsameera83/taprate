"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { kioskCreateSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { IconCheck, IconCopy, IconDownload } from "@/components/icons";

type Share = {
  active: boolean;
  link: string;
  qr: { link: string; svg: string };
  whatsapp: { text: string; url: string };
  sms: { text: string; url: string };
  widget: { url: string; code: string };
  kiosks: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }>;
};

function CopyButton({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${primary ? "btn-primary" : "btn-secondary"}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard blocked: the text is visible to copy by hand */
        }
      }}
    >
      {done ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
      {done ? "Copied" : label}
      <span className="sr-only" aria-live="polite">
        {done ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CollectPanel({ surveyId, canEdit, surveyName }: { surveyId: string; canEdit: boolean; surveyName: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Share>(`/api/surveys/${encodeURIComponent(surveyId)}/share`).then((r) => (r.ok ? setShare(r.data) : setError(r.message)));
  }, [surveyId]);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!share) return <Skeleton className="h-96 w-full rounded-[var(--radius-panel)]" />;

  // Our own server-generated SVG, shown as an image (never inserted as HTML).
  const qrDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(share.qr.svg)}`;
  const fileName = `taprate-qr-${surveyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "survey"}.svg`;

  return (
    <div className="space-y-6">
      {!share.active && <Notice kind="error">This survey is paused, so these links show &ldquo;not collecting ratings&rdquo;. Turn it on in Settings.</Notice>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="QR code" description="Print it on receipts, tables, counters or packaging. Customers scan and tap a rating.">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <img src={qrDataUrl} alt={`QR code that opens the rating page for ${surveyName}`} width={180} height={180} className="rounded-[10px] border border-line" />
            <div className="flex flex-col gap-2">
              <a className="btn btn-primary" href={qrDataUrl} download={fileName}>
                <IconDownload className="h-4 w-4" />
                Download (SVG)
              </a>
              <a className="btn btn-secondary" href={share.qr.link} target="_blank" rel="noopener noreferrer">
                Try it
              </a>
              <p className="max-w-56 text-[13px] text-muted">SVG prints sharp at any size. Most printers and Canva accept it.</p>
            </div>
          </div>
        </Card>

        <Card title="WhatsApp and SMS" description="Send the rating link after a visit, delivery or call. Opens in the customer's browser.">
          <div className="space-y-3">
            <p className="whitespace-pre-wrap rounded-[10px] bg-canvas p-3 text-sm">{share.whatsapp.text}</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-primary" href={share.whatsapp.url} target="_blank" rel="noopener noreferrer">
                Open in WhatsApp
              </a>
              <CopyButton text={share.whatsapp.text} label="Copy message" />
              <CopyButton text={share.sms.text} label="Copy for SMS" />
            </div>
            <p className="text-[13px] text-muted">Tip: save it as a WhatsApp Business quick reply, e.g. /rate.</p>
          </div>
        </Card>
      </div>

      <Card title="Website widget" description="Paste this on your website (contact page, help centre, order confirmation). Taps open the thank-you page in a new tab.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <textarea readOnly aria-label="Widget code" className="input h-28 font-mono text-xs" value={share.widget.code} />
            <CopyButton text={share.widget.code} label="Copy code" primary />
          </div>
          <div className="rounded-[12px] border border-dashed border-line-strong bg-canvas p-2">
            <iframe src={share.widget.url} title="Widget preview" className="h-[230px] w-full rounded-[10px]" loading="lazy" />
          </div>
        </div>
      </Card>

      <Card title="Plain link" description="Use anywhere else: social media, invoices, your bio.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input readOnly aria-label="Rating link" className="input font-mono text-xs" value={share.link} />
          <CopyButton text={share.link} label="Copy link" />
        </div>
      </Card>

      <Kiosks surveyId={surveyId} kiosks={share.kiosks} canEdit={canEdit} onChanged={load} />
    </div>
  );
}

function Kiosks({ surveyId, kiosks, canEdit, onChanged }: { surveyId: string; kiosks: Share["kiosks"]; canEdit: boolean; onChanged: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const parsed = kioskCreateSchema.safeParse({ name: String(new FormData(formEl).get("kioskName") ?? "") });
    if (!parsed.success) return setErrors({ kioskName: fieldErrors(parsed.error).name ?? "" });
    setErrors({});
    setBusy(true);
    const r = await api<{ id: string; url: string }>(`/api/surveys/${encodeURIComponent(surveyId)}/kiosks`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setCreated(r.data.url);
      onChanged();
    } else setError(r.message);
  }

  async function revoke(id: string, name: string) {
    if (!window.confirm(`Switch off “${name}”? The tablet will stop accepting ratings straight away.`)) return;
    const r = await api(`/api/kiosks/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) onChanged();
    else setError(r.message);
  }

  return (
    <Card
      title="Tablet kiosk"
      description="Put a tablet at your counter or reception. Customers tap a face; the screen thanks them and resets for the next person."
    >
      <div className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        {created && (
          <Notice kind="success">
            Kiosk link created. Open it on the tablet and add it to the home screen. This is the only time the full link is shown.
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-white px-1.5 py-0.5 text-[12px]">{created}</code>
              <CopyButton text={created} label="Copy" />
            </span>
          </Notice>
        )}
        {kiosks.length > 0 && (
          <ul className="divide-y divide-line rounded-[10px] border border-line">
            {kiosks.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-semibold">{k.name}</span>
                  <span className="block text-[12px] text-muted">{k.lastUsedAt ? `Last rating ${new Date(k.lastUsedAt).toLocaleString()}` : "Not used yet"}</span>
                </span>
                {canEdit && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => revoke(k.id, k.name)}>
                    Switch off
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form onSubmit={create} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Kiosk name" name="kioskName" error={errors.kioskName || undefined}>
                <TextInput name="kioskName" placeholder="e.g. Front desk, Kandy branch" maxLength={60} error={errors.kioskName || undefined} />
              </Field>
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create kiosk link"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted">Only owners and admins can create kiosks.</p>
        )}
        <p className="text-[13px] text-muted">Each tap counts as one rating. Taps are limited to one every 2 seconds per kiosk, so nobody can flood your results.</p>
      </div>
    </Card>
  );
}
