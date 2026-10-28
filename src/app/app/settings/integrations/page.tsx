"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { helpdeskCreateSchema, integrationCreateSchema, fieldErrors } from "@/lib/validation/schemas";
import { Badge, EmptyState, Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { IconCopy } from "@/components/icons";
import { confirmDialog } from "@/components/ConfirmDialog";

type Integration = {
  id: string;
  kind: "slack" | "teams" | "webhook" | "zendesk" | "freshdesk";
  name: string;
  urlHint: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  lastStatus: "ok" | "failed" | null;
  lastDeliveryAt: string | null;
};

const KIND: Record<Integration["kind"], { label: string; help: string; placeholder: string }> = {
  slack: {
    label: "Slack",
    help: "In Slack: Apps → Incoming Webhooks → Add to a channel → copy the Webhook URL.",
    placeholder: "https://hooks.slack.com/services/…",
  },
  teams: {
    label: "Microsoft Teams",
    help: "In Teams: the channel's ⋯ menu → Workflows → “Post to a channel when a webhook request is received” → copy the URL.",
    placeholder: "https://…webhook.office.com/… or …logic.azure.com/…",
  },
  webhook: {
    label: "Webhook (your own system)",
    help: "We POST a JSON event to your https URL, signed with a secret so you can check it came from TapRate.",
    placeholder: "https://example.com/taprate-webhook",
  },
  zendesk: {
    label: "Zendesk",
    help: "Adds each rating as a private note on its ticket. In Zendesk: Admin Center → Apps and integrations → Zendesk API → turn on token access → Add API token.",
    placeholder: "",
  },
  freshdesk: {
    label: "Freshdesk",
    help: "Adds each rating as a private note on its ticket. In Freshdesk: your profile picture → Profile settings → copy “Your API Key”.",
    placeholder: "",
  },
};
const isHelpdeskKind = (k: Integration["kind"]): k is "zendesk" | "freshdesk" => k === "zendesk" || k === "freshdesk";

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Integration[]>("/api/integrations").then((r) => (r.ok ? setItems(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <AddIntegration onAdded={load} />
      <SettingsSection title="Connected">
        {error && <LoadError message={error} onRetry={load} />}
        {!items && !error && <Skeleton className="h-24 w-full" />}
        {items && items.length === 0 && <EmptyState title="Nothing connected yet" body="Send unhappy-customer alerts to the place your team already works." />}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <Row key={i.id} item={i} onChanged={load} />
            ))}
          </ul>
        )}
      </SettingsSection>
      <SettingsSection title="For developers: webhook format">
        <div className="space-y-2 text-sm text-muted">
          <p>
            Each event is a JSON <code className="rounded bg-canvas px-1">POST</code> with header <code className="rounded bg-canvas px-1">X-TapRate-Signature: t=…,v1=…</code>.
            Compute HMAC-SHA256 of <code className="rounded bg-canvas px-1">{"{t}.{raw body}"}</code> with your signing secret and compare it to <code className="rounded bg-canvas px-1">v1</code>.
            Reject events whose <code className="rounded bg-canvas px-1">t</code> is more than 5 minutes old.
          </p>
          <pre className="overflow-x-auto rounded-[10px] bg-canvas p-3 text-[12px] text-ink">{`{
  "event": "rating.created",
  "id": "…",
  "created_at": "2026-10-27T09:30:00Z",
  "survey": { "id": "…", "name": "Support" },
  "rating": { "value": 2, "label": "Poor", "sentiment": "negative" },
  "customer": { "email": "amaya@example.com" },
  "agent": "Nimal", "ticket": "T-1042", "channel": "email"
}`}</pre>
        </div>
      </SettingsSection>
    </div>
  );
}

function AddIntegration({ onAdded }: { onAdded: () => void }) {
  const [kind, setKind] = useState<Integration["kind"]>("slack");
  const [events, setEvents] = useState<"negative" | "all">("negative");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string; secret?: string } | null>(null);

  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const name = String(f.get("intName") ?? "");
    let path = "/api/integrations";
    let payload: unknown;
    if (isHelpdeskKind(kind)) {
      // Same schema the server uses.
      const parsed = helpdeskCreateSchema.safeParse(
        kind === "zendesk"
          ? { kind, name, subdomain: String(f.get("hdSub") ?? ""), email: String(f.get("hdEmail") ?? ""), apiToken: String(f.get("hdSecret") ?? ""), events: [events] }
          : { kind, name, subdomain: String(f.get("hdSub") ?? ""), apiKey: String(f.get("hdSecret") ?? ""), events: [events] },
      );
      if (!parsed.success) {
        const errs = fieldErrors(parsed.error);
        return setErrors({ intName: errs.name ?? "", hdSub: errs.subdomain ?? "", hdEmail: errs.email ?? "", hdSecret: errs.apiToken ?? errs.apiKey ?? "" });
      }
      path = "/api/integrations/helpdesk";
      payload = parsed.data;
    } else {
      const parsed = integrationCreateSchema.safeParse({ kind, name, url: String(f.get("intUrl") ?? ""), events: [events] });
      if (!parsed.success) {
        const errs = fieldErrors(parsed.error);
        return setErrors({ intName: errs.name ?? "", intUrl: errs.url ?? "" });
      }
      payload = parsed.data;
    }
    setErrors({});
    setBusy(true);
    const r = await api<{ id: string; signingSecret?: string | null }>(path, { method: "POST", body: payload });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setNotice(
        r.data.signingSecret
          ? { kind: "success", text: "Webhook added. Copy your signing secret now: it won't be shown again.", secret: r.data.signingSecret }
          : { kind: "success", text: isHelpdeskKind(kind) ? "Connected. Use “Check connection” to make sure the token works." : "Connected. Use “Send test” to check it." },
      );
      onAdded();
    } else {
      const fl = r.fields ?? {};
      setErrors({ intName: fl.name ?? "", intUrl: fl.url ?? "", hdSub: fl.subdomain ?? "", hdEmail: fl.email ?? "", hdSecret: fl.apiToken ?? fl.apiKey ?? "" });
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }

  return (
    <SettingsSection title="Connect another app" description="Get a message in Slack, Teams or your own system, or add ratings to Zendesk / Freshdesk tickets.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && (
          <Notice kind={notice.kind}>
            {notice.text}
            {notice.secret && (
              <span className="mt-2 flex items-center gap-2">
                <code className="break-all rounded bg-white px-1.5 py-0.5 text-[13px]">{notice.secret}</code>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Copy secret" onClick={() => navigator.clipboard.writeText(notice.secret!)}>
                  <IconCopy className="h-4 w-4" />
                </button>
              </span>
            )}
          </Notice>
        )}
        <div role="radiogroup" aria-label="App" className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(KIND) as Array<Integration["kind"]>).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setErrors({});
              }}
              className={`min-h-11 rounded-[10px] border px-3 py-2 text-left text-sm font-semibold ${kind === k ? "border-brand bg-brand-soft text-brand" : "border-line hover:border-line-strong"}`}
            >
              {KIND[k].label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">{KIND[kind].help}</p>
        {isHelpdeskKind(kind) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="intName" error={errors.intName || undefined}>
              <TextInput name="intName" placeholder={`e.g. ${KIND[kind].label}`} maxLength={60} error={errors.intName || undefined} />
            </Field>
            <Field label={`${KIND[kind].label} address`} name="hdSub" error={errors.hdSub || undefined}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted">https://</span>
                <TextInput name="hdSub" placeholder="acme" autoComplete="off" maxLength={63} error={errors.hdSub || undefined} />
                <span className="text-sm text-muted">.{kind}.com</span>
              </div>
            </Field>
            {kind === "zendesk" && (
              <Field label="Agent email" name="hdEmail" error={errors.hdEmail || undefined} hint="The Zendesk user the notes are added as.">
                <TextInput name="hdEmail" type="email" autoComplete="off" maxLength={254} error={errors.hdEmail || undefined} hasHint />
              </Field>
            )}
            <Field label={kind === "zendesk" ? "API token" : "API key"} name="hdSecret" error={errors.hdSecret || undefined}>
              <TextInput name="hdSecret" type="password" autoComplete="off" maxLength={100} error={errors.hdSecret || undefined} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <Field label="Name" name="intName" error={errors.intName || undefined}>
              <TextInput name="intName" placeholder="e.g. #support" maxLength={60} error={errors.intName || undefined} />
            </Field>
            <Field label="Webhook URL" name="intUrl" error={errors.intUrl || undefined}>
              <TextInput name="intUrl" type="url" inputMode="url" autoComplete="off" placeholder={KIND[kind].placeholder} maxLength={1000} error={errors.intUrl || undefined} />
            </Field>
          </div>
        )}
        {isHelpdeskKind(kind) && (
          <p className="text-[13px] text-muted">
            Ratings are matched to tickets by the ticket number in the link, so use the {KIND[kind].label} option on a survey&rsquo;s &ldquo;Add to emails&rdquo; tab.
            The customer&rsquo;s first comment is added too.
          </p>
        )}
        <fieldset>
          <legend className="text-sm font-semibold">Send</legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="events" checked={events === "negative"} onChange={() => setEvents("negative")} className="h-4 w-4 accent-[var(--color-brand)]" />
              Only negative ratings
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="events" checked={events === "all"} onChange={() => setEvents("all")} className="h-4 w-4 accent-[var(--color-brand)]" />
              Every rating
            </label>
          </div>
        </fieldset>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Connecting…" : "Connect"}
        </button>
        <p className="text-[13px] text-muted">
          {isHelpdeskKind(kind) ? "The address and token are" : "The URL is"} stored encrypted and can&rsquo;t be viewed again after saving.
        </p>
      </form>
    </SettingsSection>
  );
}

function Row({ item, onChanged }: { item: Integration; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      if (success) setMsg({ kind: "success", text: success });
      onChanged();
    } else setMsg({ kind: "error", text: r.message ?? "Something went wrong." });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {item.name} <span className="font-normal text-muted">({KIND[item.kind].label})</span>
          </p>
          <p className="text-[13px] text-muted">
            {item.urlHint}, {item.events.includes("all") ? "every rating" : "negative ratings"}
            {isHelpdeskKind(item.kind) ? " added to tickets" : ""}
            {item.lastStatus && (
              <>
                , last delivery <Badge tone={item.lastStatus === "ok" ? "pos" : "neg"}>{item.lastStatus === "ok" ? "OK" : "failed"}</Badge>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api(`/api/integrations/${item.id}/test`, { method: "POST" }), isHelpdeskKind(item.kind) ? "Connected: TapRate can sign in to your helpdesk." : "Test sent. Check your channel.")}>
            {isHelpdeskKind(item.kind) ? "Check connection" : "Send test"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => run(() => api(`/api/integrations/${item.id}`, { method: "PATCH", body: { enabled: !item.enabled } }))}
          >
            {item.enabled ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={async () => {
              if (await confirmDialog({ title: `Disconnect ${item.name}?`, body: "TapRate will stop sending ratings there.", confirmLabel: "Disconnect", danger: true }))
                run(() => api(`/api/integrations/${item.id}`, { method: "DELETE" }));
            }}
          >
            Remove
          </button>
        </div>
      </div>
      {!item.enabled && <p className="mt-1 text-[13px] text-muted">Paused: nothing is being sent.</p>}
      {msg && (
        <div className="mt-2">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}
    </li>
  );
}
