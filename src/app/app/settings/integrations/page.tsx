"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { helpdeskCreateSchema, integrationCreateSchema, shopifyCreateSchema, shopifyKeySchema, fieldErrors } from "@/lib/validation/schemas";
import { Badge, EmptyState, Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { IconCopy } from "@/components/icons";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PaidFeatureNotice, useAllows } from "@/components/PlanContext";

type Integration = {
  id: string;
  kind: "slack" | "teams" | "webhook" | "zendesk" | "freshdesk" | "gorgias" | "intercom" | "front" | "shopify";
  name: string;
  urlHint: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  lastStatus: "ok" | "failed" | null;
  lastDeliveryAt: string | null;
  surveyId: string | null;
  hasKey: boolean | null;
};
type SurveyLite = { id: string; name: string; status: string };

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
    help: "We POST a JSON event to your https URL, signed with a secret so you can check it came from TapTruly.",
    placeholder: "https://example.com/taptruly-webhook",
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
  gorgias: {
    label: "Gorgias",
    help: "Adds each rating as an internal note on its ticket. In Gorgias: Settings → REST API → copy your username (email) and API key.",
    placeholder: "",
  },
  intercom: {
    label: "Intercom",
    help: "Adds a note to the customer's latest conversation (last 14 days), found by their email. In Intercom: Settings → Integrations → Developer Hub → New app → Authentication → copy the access token. The app needs to read and write conversations and read admins.",
    placeholder: "",
  },
  front: {
    label: "Front",
    help: "Adds each rating as a comment on its conversation (only your teammates see comments). In Front: Settings → Developers → API tokens → Create API token, with shared resources and access to conversations.",
    placeholder: "",
  },
  shopify: {
    label: "Shopify",
    help: "Emails your survey to customers after an order. Connect here first; we then show the address to paste into Shopify.",
    placeholder: "",
  },
};
type HelpdeskUiKind = "zendesk" | "freshdesk" | "gorgias" | "intercom" | "front";
const isHelpdeskKind = (k: Integration["kind"]): k is HelpdeskUiKind => k === "zendesk" || k === "freshdesk" || k === "gorgias" || k === "intercom" || k === "front";
const webhookUrl = (id: string) => `${typeof window === "undefined" ? "" : window.location.origin}/api/webhooks/shopify/${id}`;

export default function IntegrationsPage() {
  const allowed = useAllows("integrations");
  const [items, setItems] = useState<Integration[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Integration[]>("/api/integrations").then((r) => (r.ok ? setItems(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <PaidFeatureNotice feature="integrations" />
      {allowed && <AddIntegration onAdded={load} />}
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
            Each event is a JSON <code className="rounded bg-canvas px-1">POST</code> with header <code className="rounded bg-canvas px-1">X-TapTruly-Signature: t=…,v1=…</code>.
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
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string; secret?: string; secretLabel?: string } | null>(null);
  const [region, setRegion] = useState<"us" | "eu" | "au">("us");
  const [surveys, setSurveys] = useState<SurveyLite[] | null>(null);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind === "shopify" && !surveys) api<SurveyLite[]>("/api/surveys").then((r) => setSurveys(r.ok ? r.data : []));
  }, [kind, surveys]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const name = String(f.get("intName") ?? "");
    let path = "/api/integrations";
    let payload: unknown;
    const sub = String(f.get("hdSub") ?? "");
    const secret = String(f.get("hdSecret") ?? "");
    if (kind === "shopify") {
      const key = String(f.get("shopKey") ?? "").trim();
      const parsed = shopifyCreateSchema.safeParse({ name, shop: String(f.get("shopDomain") ?? ""), surveyId: String(f.get("shopSurvey") ?? ""), ...(key ? { signingSecret: key } : {}) });
      if (!parsed.success) {
        const errs = fieldErrors(parsed.error);
        return setErrors({ intName: errs.name ?? "", shopDomain: errs.shop ?? "", shopSurvey: errs.surveyId ? "Choose a survey" : "", shopKey: errs.signingSecret ?? "" });
      }
      path = "/api/integrations/shopify";
      payload = parsed.data;
    } else if (isHelpdeskKind(kind)) {
      // Same schema the server uses.
      const parsed = helpdeskCreateSchema.safeParse(
        kind === "zendesk"
          ? { kind, name, subdomain: sub, email: String(f.get("hdEmail") ?? ""), apiToken: secret, events: [events] }
          : kind === "freshdesk"
            ? { kind, name, subdomain: sub, apiKey: secret, events: [events] }
            : kind === "gorgias"
              ? { kind, name, subdomain: sub, email: String(f.get("hdEmail") ?? ""), apiKey: secret, events: [events] }
              : kind === "front"
                ? { kind, name, apiToken: secret, events: [events] }
                : { kind, name, region, accessToken: secret, events: [events] },
      );
      if (!parsed.success) {
        const errs = fieldErrors(parsed.error);
        return setErrors({ intName: errs.name ?? "", hdSub: errs.subdomain ?? errs.region ?? "", hdEmail: errs.email ?? "", hdSecret: errs.apiToken ?? errs.apiKey ?? errs.accessToken ?? "" });
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
    const r = await api<{ id: string; signingSecret?: string | null; webhookUrl?: string; surveyActive?: boolean }>(path, { method: "POST", body: payload });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setNotice(
        r.data.webhookUrl
          ? {
              kind: "success",
              text: `Shop connected. Now in Shopify admin: Settings → Notifications → Webhooks → Create webhook. Event “Order fulfillment”, format JSON, and paste this URL.${r.data.surveyActive === false ? " (Your survey is paused: turn it on so emails go out.)" : ""}`,
              secret: r.data.webhookUrl,
              secretLabel: "Copy webhook URL",
            }
          : r.data.signingSecret
            ? { kind: "success", text: "Webhook added. Copy your signing secret now: it won't be shown again.", secret: r.data.signingSecret, secretLabel: "Copy secret" }
            : { kind: "success", text: isHelpdeskKind(kind) ? "Connected. Use “Check connection” to make sure the token works." : "Connected. Use “Send test” to check it." },
      );
      onAdded();
    } else {
      const fl = r.fields ?? {};
      setErrors({ intName: fl.name ?? "", intUrl: fl.url ?? "", hdSub: fl.subdomain ?? fl.region ?? "", hdEmail: fl.email ?? "", hdSecret: fl.apiToken ?? fl.apiKey ?? fl.accessToken ?? "", shopDomain: fl.shop ?? "", shopSurvey: fl.surveyId ?? "", shopKey: fl.signingSecret ?? "" });
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }

  return (
    <SettingsSection title="Connect another app" description="Get a message in Slack, Teams or your own system, add ratings to your helpdesk tickets, or email a survey after every Shopify order.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && (
          <Notice kind={notice.kind}>
            {notice.text}
            {notice.secret && (
              <span className="mt-2 flex items-center gap-2">
                <code className="break-all rounded bg-white px-1.5 py-0.5 text-[13px]">{notice.secret}</code>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={notice.secretLabel ?? "Copy"} onClick={() => navigator.clipboard.writeText(notice.secret!)}>
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
        {kind === "shopify" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="intName" error={errors.intName || undefined}>
              <TextInput name="intName" placeholder="e.g. Online shop" maxLength={60} error={errors.intName || undefined} />
            </Field>
            <Field label="Shop address" name="shopDomain" error={errors.shopDomain || undefined} hint="Your myshopify.com address, e.g. acme.myshopify.com">
              <TextInput name="shopDomain" placeholder="acme.myshopify.com" autoComplete="off" maxLength={200} error={errors.shopDomain || undefined} hasHint />
            </Field>
            <Field label="Survey to email" name="shopSurvey" error={errors.shopSurvey || undefined}>
              <select id="shopSurvey" name="shopSurvey" className="input" defaultValue="" aria-invalid={errors.shopSurvey ? true : undefined}>
                <option value="" disabled>
                  {surveys === null ? "Loading…" : surveys.length ? "Choose a survey" : "Create a survey first"}
                </option>
                {(surveys ?? []).map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
                    {sv.status !== "active" ? " (paused)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Webhook signing key (optional now)" name="shopKey" error={errors.shopKey || undefined} hint="Shown in Shopify above the webhooks list once you have a webhook. You can add it later.">
              <TextInput name="shopKey" type="password" autoComplete="off" maxLength={200} error={errors.shopKey || undefined} hasHint />
            </Field>
          </div>
        ) : isHelpdeskKind(kind) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="intName" error={errors.intName || undefined}>
              <TextInput name="intName" placeholder={`e.g. ${KIND[kind].label}`} maxLength={60} error={errors.intName || undefined} />
            </Field>
            {kind === "front" ? null : kind === "intercom" ? (
              <Field label="Data region" name="hdSub" error={errors.hdSub || undefined} hint="Where your Intercom workspace is hosted.">
                <select id="hdSub" className="input" value={region} onChange={(e) => setRegion(e.target.value as "us" | "eu" | "au")}>
                  <option value="us">United States (most workspaces)</option>
                  <option value="eu">Europe</option>
                  <option value="au">Australia</option>
                </select>
              </Field>
            ) : (
              <Field label={`${KIND[kind].label} address`} name="hdSub" error={errors.hdSub || undefined}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted">https://</span>
                  <TextInput name="hdSub" placeholder="acme" autoComplete="off" maxLength={63} error={errors.hdSub || undefined} />
                  <span className="text-sm text-muted">.{kind}.com</span>
                </div>
              </Field>
            )}
            {(kind === "zendesk" || kind === "gorgias") && (
              <Field
                label={kind === "zendesk" ? "Agent email" : "Gorgias username (email)"}
                name="hdEmail"
                error={errors.hdEmail || undefined}
                hint={kind === "zendesk" ? "The Zendesk user the notes are added as." : "Notes are added as this Gorgias user."}
              >
                <TextInput name="hdEmail" type="email" autoComplete="off" maxLength={254} error={errors.hdEmail || undefined} hasHint />
              </Field>
            )}
            <Field label={kind === "zendesk" || kind === "front" ? "API token" : kind === "intercom" ? "Access token" : "API key"} name="hdSecret" error={errors.hdSecret || undefined}>
              <TextInput name="hdSecret" type="password" autoComplete="off" maxLength={kind === "front" ? 1500 : 300} error={errors.hdSecret || undefined} />
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
        {isHelpdeskKind(kind) && kind !== "intercom" && kind !== "front" && (
          <p className="text-[13px] text-muted">
            Ratings are matched to tickets by the ticket number in the link, so use the {KIND[kind].label} option on a survey&rsquo;s &ldquo;Add to emails&rdquo; tab.
            The customer&rsquo;s first comment is added too.
          </p>
        )}
        {kind === "front" && (
          <p className="text-[13px] text-muted">
            Ratings are matched to conversations by the conversation id in the link, so use the Front option on a survey&rsquo;s &ldquo;Add to emails&rdquo; tab. The customer&rsquo;s
            first comment is added too.
          </p>
        )}
        {kind === "intercom" && (
          <p className="text-[13px] text-muted">Only ratings with the customer&rsquo;s email can be matched, for example from survey emails TapTruly sends or links with the email filled in.</p>
        )}
        {kind === "shopify" && (
          <p className="text-[13px] text-muted">
            We read only the customer&rsquo;s email, first name and order number. Your usual rules apply: nobody is emailed twice in 30 days, and unsubscribes are respected.
          </p>
        )}
        {kind !== "shopify" && (
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
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Connecting…" : "Connect"}
        </button>
        <p className="text-[13px] text-muted">
          {kind === "shopify" ? "The shop address and signing key are" : isHelpdeskKind(kind) ? "The address and token are" : "The URL is"} stored encrypted and can&rsquo;t be viewed again after saving.
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
            {item.kind === "shopify" ? `${item.urlHint}, survey email after each order` : `${item.urlHint}, ${item.events.includes("all") ? "every rating" : "negative ratings"}`}
            {isHelpdeskKind(item.kind) ? (item.kind === "intercom" || item.kind === "front" ? " added to conversations" : " added to tickets") : ""}
            {item.lastStatus && (
              <>
                , last delivery <Badge tone={item.lastStatus === "ok" ? "pos" : "neg"}>{item.lastStatus === "ok" ? "OK" : "failed"}</Badge>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.kind !== "shopify" && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api(`/api/integrations/${item.id}/test`, { method: "POST" }), isHelpdeskKind(item.kind) ? "Connected: TapTruly can sign in to your helpdesk." : "Test sent. Check your channel.")}>
              {isHelpdeskKind(item.kind) ? "Check connection" : "Send test"}
            </button>
          )}
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
              if (await confirmDialog({ title: `Disconnect ${item.name}?`, body: "TapTruly will stop sending ratings there.", confirmLabel: "Disconnect", danger: true }))
                run(() => api(`/api/integrations/${item.id}`, { method: "DELETE" }));
            }}
          >
            Remove
          </button>
        </div>
      </div>
      {!item.enabled && <p className="mt-1 text-[13px] text-muted">Paused: nothing is being sent.</p>}
      {item.kind === "shopify" && <ShopifySetup item={item} onChanged={onChanged} />}
      {msg && (
        <div className="mt-2">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}
    </li>
  );
}

/** The address to paste into Shopify, and the signing key (Shopify shows it once a webhook exists). */
function ShopifySetup({ item, onChanged }: { item: Integration; onChanged: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!item.hasKey);
  const [copied, setCopied] = useState(false);
  const url = webhookUrl(item.id);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = shopifyKeySchema.safeParse({ signingSecret: String(new FormData(e.currentTarget).get("key") ?? "") });
    if (!parsed.success) return setError(fieldErrors(parsed.error).signingSecret ?? "Check the key");
    setError("");
    setBusy(true);
    const r = await api(`/api/integrations/${item.id}/signing-key`, { method: "PUT", body: parsed.data });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setEditing(false);
    onChanged();
  }

  return (
    <div className="mt-3 space-y-3 rounded-[10px] border border-line bg-canvas p-3 text-[13px]">
      <div>
        <p className="font-semibold">Webhook URL for Shopify</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-white px-1.5 py-1">{url}</code>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                /* still selectable */
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-muted">In Shopify: Settings → Notifications → Webhooks → Create webhook → Event &ldquo;Order fulfillment&rdquo;, format JSON, this URL.</p>
      </div>
      {editing ? (
        <form onSubmit={save} noValidate className="space-y-2">
          <Field label="Webhook signing key" name="key" error={error || undefined} hint="Shopify shows it above your list of webhooks.">
            <TextInput name="key" type="password" autoComplete="off" maxLength={200} error={error || undefined} hasHint />
          </Field>
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "Saving…" : "Save key"}
          </button>
          {!item.hasKey && <p className="text-muted">Until the key is added, Shopify&rsquo;s notifications are refused (Shopify keeps retrying for 48 hours, so no orders are missed).</p>}
        </form>
      ) : (
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone="pos">Signing key added</Badge>
          <button type="button" className="link" onClick={() => setEditing(true)}>
            Replace key
          </button>
        </p>
      )}
    </div>
  );
}
