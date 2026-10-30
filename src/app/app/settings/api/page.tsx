"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { apiKeyCreateSchema, fieldErrors } from "@/lib/validation/schemas";
import { Badge, EmptyState, Field, LoadError, Notice, PasswordInput, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { IconCopy } from "@/components/icons";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PaidFeatureNotice, useAllows } from "@/components/PlanContext";
import { Busy } from "@/components/FaceLoader";

type ApiKey = {
  id: string;
  name: string;
  hint: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ApiKeysPage() {
  const allowed = useAllows("api");
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<ApiKey[]>("/api/api-keys").then((r) => (r.ok ? setKeys(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-6">
      <PaidFeatureNotice feature="api" />
      {allowed && <CreateKey onCreated={load} />}
      <SettingsSection title="Your keys">
        {error && <LoadError message={error} onRetry={load} />}
        {!keys && !error && <Skeleton className="h-24 w-full" />}
        {keys && keys.length === 0 && <EmptyState title="No API keys yet" body="Create a key to read ratings from your own systems or make signed rating links." />}
        {keys && keys.length > 0 && (
          <ul className="divide-y divide-line">
            {keys.map((k) => (
              <KeyRow key={k.id} item={k} onChanged={load} />
            ))}
          </ul>
        )}
      </SettingsSection>
      <SettingsSection title="For developers" description="Send the key in the Authorization header from your server. Never put it in a web page, app or URL.">
        <div className="space-y-3 text-sm text-muted">
          <p className="font-semibold text-ink">List recent ratings</p>
          <pre className="overflow-x-auto rounded-[10px] bg-canvas p-3 text-[12px] text-ink">{`curl ${origin}/api/v1/responses?limit=20 \\
  -H "Authorization: Bearer tr_…"`}</pre>
          <p>
            Filters: <code className="rounded bg-canvas px-1">survey_id</code>, <code className="rounded bg-canvas px-1">since</code>,{" "}
            <code className="rounded bg-canvas px-1">until</code> (ISO dates), <code className="rounded bg-canvas px-1">sentiment</code>,{" "}
            <code className="rounded bg-canvas px-1">channel</code>. Pass <code className="rounded bg-canvas px-1">next_cursor</code> back as{" "}
            <code className="rounded bg-canvas px-1">cursor</code> for the next page.
          </p>
          <p className="font-semibold text-ink">Make signed rating links for one customer (read &amp; write key)</p>
          <pre className="overflow-x-auto rounded-[10px] bg-canvas p-3 text-[12px] text-ink">{`curl -X POST ${origin}/api/v1/surveys/<survey id>/links \\
  -H "Authorization: Bearer tr_…" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"amaya@example.com","agent":"Nimal","ticket":"T-1042"}'`}</pre>
          <p>
            Ratings from these links are marked <strong className="text-ink">verified</strong>: the customer can&rsquo;t change the email, agent or ticket.
          </p>
          <p className="font-semibold text-ink">Have TapTruly email the survey to one customer (read &amp; write key)</p>
          <pre className="overflow-x-auto rounded-[10px] bg-canvas p-3 text-[12px] text-ink">{`curl -X POST ${origin}/api/v1/surveys/<survey id>/send \\
  -H "Authorization: Bearer tr_…" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"amaya@example.com","name":"Amaya","ticket":"T-1042"}'`}</pre>
          <p>
            Use it from Zapier, Make, Shopify Flow or your helpdesk when an order is delivered or a ticket is solved. People who unsubscribed,
            bounced, or were emailed in the last 30 days (change with <code className="rounded bg-canvas px-1">skip_recent_days</code>) are skipped, and the
            answer&rsquo;s <code className="rounded bg-canvas px-1">status</code> says what happened. Your daily email limit applies.
          </p>
          <p>
            Other endpoints: <code className="rounded bg-canvas px-1">GET /api/v1/surveys</code>, <code className="rounded bg-canvas px-1">GET /api/v1/responses/&lt;id&gt;</code>.
            Limits: 120 reads and 60 writes a minute per key.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}

function CreateKey({ onCreated }: { onCreated: () => void }) {
  const [access, setAccess] = useState<"read" | "read_write">("read");
  const [expires, setExpires] = useState<"30" | "90" | "365" | "never">("90");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string; key?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = apiKeyCreateSchema.safeParse({
      name: String(f.get("keyName") ?? ""),
      access,
      expiresInDays: expires === "never" ? null : Number(expires),
      password: String(f.get("keyPassword") ?? ""),
    });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      return setErrors({ keyName: errs.name ?? "", keyPassword: errs.password ?? "" });
    }
    setErrors({});
    setBusy(true);
    const r = await api<{ id: string; key: string }>("/api/api-keys", { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setCopied(false);
      setNotice({ kind: "success", text: "Key created. Copy it now and store it somewhere safe: it won't be shown again.", key: r.data.key });
      onCreated();
    } else {
      setErrors({ keyName: r.fields?.name ?? "", keyPassword: r.fields?.password ?? "" });
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }

  return (
    <SettingsSection title="Create an API key" description="Lets your own systems read ratings or create signed rating links. Keys belong to this business.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && (
          <Notice kind={notice.kind}>
            {notice.text}
            {notice.key && (
              <span className="mt-2 flex items-center gap-2">
                <code className="break-all rounded bg-white px-1.5 py-0.5 text-[13px]">{notice.key}</code>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label="Copy key"
                  onClick={() => navigator.clipboard.writeText(notice.key!).then(() => setCopied(true))}
                >
                  <IconCopy className="h-4 w-4" />
                  {copied ? "Copied" : ""}
                </button>
              </span>
            )}
          </Notice>
        )}
        <Field label="Name" name="keyName" error={errors.keyName || undefined} hint="Where it's used, e.g. “CRM sync”">
          <TextInput name="keyName" maxLength={60} autoComplete="off" error={errors.keyName || undefined} hasHint />
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">Access</legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="access" checked={access === "read"} onChange={() => setAccess("read")} className="h-4 w-4 accent-[var(--color-brand)]" />
              Read ratings and surveys
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="access" checked={access === "read_write"} onChange={() => setAccess("read_write")} className="h-4 w-4 accent-[var(--color-brand)]" />
              Read, and create rating links
            </label>
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor="keyExpires" className="block text-sm font-semibold">
            Expires
          </label>
          <select id="keyExpires" className="input w-auto" value={expires} onChange={(e) => setExpires(e.target.value as typeof expires)}>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In 1 year</option>
            <option value="never">Never</option>
          </select>
        </div>
        <Field label="Your password" name="keyPassword" error={errors.keyPassword || undefined} hint="Confirms it's really you.">
          <PasswordInput name="keyPassword" autoComplete="current-password" error={errors.keyPassword || undefined} hasHint />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <Busy>Creating…</Busy> : "Create key"}
        </button>
      </form>
    </SettingsSection>
  );
}

function KeyRow({ item, onChanged }: { item: ApiKey; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const expired = item.expiresAt !== null && Date.parse(item.expiresAt) <= Date.now();
  const active = !item.revokedAt && !expired;

  async function revoke() {
    if (!(await confirmDialog({ title: `Revoke “${item.name}”?`, body: "Anything using this key will stop working straight away. This can't be undone.", confirmLabel: "Revoke key", danger: true }))) return;
    setBusy(true);
    setMsg("");
    const r = await api(`/api/api-keys/${item.id}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) onChanged();
    else setMsg(r.message);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {item.name}
          <code className="rounded bg-canvas px-1.5 text-[12px] font-normal">{item.hint}</code>
          {item.revokedAt ? <Badge tone="plain">Revoked</Badge> : expired ? <Badge tone="neg">Expired</Badge> : <Badge tone="pos">Active</Badge>}
        </p>
        <p className="text-[13px] text-muted">
          {item.scopes.includes("write") ? "Read & create links" : "Read only"}, created {fmt(item.createdAt)}
          {item.expiresAt && !item.revokedAt ? `, ${expired ? "expired" : "expires"} ${fmt(item.expiresAt)}` : ""}
          {item.lastUsedAt ? `, last used ${fmt(item.lastUsedAt)}` : ", never used"}
        </p>
        {msg && <p className="mt-1 text-[13px] font-medium text-neg-text">{msg}</p>}
      </div>
      {active && (
        <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={revoke}>
          Revoke
        </button>
      )}
    </li>
  );
}
