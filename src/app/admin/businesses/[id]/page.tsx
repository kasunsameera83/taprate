"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { formatMoney, type Currency } from "@/lib/billing/catalog";
import { adminCreditsSchema } from "@/lib/validation/admin";
import { fieldErrors } from "@/lib/validation/schemas";
import { Badge, Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { IconArrowLeft } from "@/components/icons";

type Detail = {
  id: string;
  name: string;
  plan: string;
  credits: number;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  local_languages: boolean;
  members: Array<{ email: string; role: string }>;
  surveys: number;
  responses_total: number;
  responses_30d: number;
  subscriptions: Array<{ provider: string; plan: string; interval: string; amount_minor: number; currency: Currency; status: string; cancel_at_period_end: boolean; current_period_end: string | null }>;
  payments: Array<{ receipt_no: string; description: string; amount_minor: number; currency: Currency; status: string; paid_at: string; provider: string }>;
  adjustments: Array<{ amount: number; reason: string; balance_after: number; created_at: string }>;
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function AdminBusiness({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Detail>(`/api/admin/businesses/${encodeURIComponent(id)}`).then((r) => (r.ok ? setD(r.data) : setError(r.message)));
  }, [id]);
  useEffect(load, [load]);
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!d) return <Skeleton className="h-96 w-full rounded-[var(--radius-panel)]" />;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/admin/businesses" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft className="h-4 w-4" />
          Businesses
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px] font-bold leading-tight">{d.name}</h1>
          {d.suspended_at ? <Badge tone="neg">Suspended</Badge> : <Badge tone="pos">Active</Badge>}
        </div>
        <p className="text-sm text-muted">
          <span className="capitalize">{d.plan}</span> plan · {d.credits.toLocaleString()} responses left · joined {day(d.created_at)} · {d.surveys} surveys ·{" "}
          {d.responses_30d.toLocaleString()} ratings in 30 days ({d.responses_total.toLocaleString()} total)
        </p>
        {d.suspended_at && <Notice kind="error">Suspended on {day(d.suspended_at)}: {d.suspended_reason}</Notice>}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsSection title="Team">
          <ul className="space-y-1 text-sm">
            {d.members.map((m) => (
              <li key={m.email}>
                {m.email} <span className="capitalize text-muted">({m.role})</span>
              </li>
            ))}
          </ul>
        </SettingsSection>
        <Credits id={d.id} onDone={load} />
      </div>

      <SettingsSection title="Subscriptions">
        {d.subscriptions.length === 0 ? (
          <p className="text-sm text-muted">No subscriptions.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {d.subscriptions.map((s, i) => (
              <li key={i}>
                <span className="font-semibold capitalize">{s.plan}</span> {s.interval}ly · {formatMoney(Number(s.amount_minor), s.currency)} via {s.provider} ·{" "}
                <span className={s.status === "past_due" ? "font-semibold text-neg-text" : ""}>{s.status.replace("_", " ")}</span>
                {s.cancel_at_period_end ? " (cancelling)" : ""}
                {s.current_period_end ? ` · period ends ${day(s.current_period_end)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="Payments">
        {d.payments.length === 0 ? (
          <p className="text-sm text-muted">No payments.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.payments.map((p) => (
              <li key={p.receipt_no} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {day(p.paid_at)} · {p.description} <span className="text-muted">({p.receipt_no}, {p.provider})</span>
                  {p.status === "refunded" && (
                    <>
                      {" "}
                      <Badge tone="plain">Refunded</Badge>
                    </>
                  )}
                </span>
                <span className="font-semibold tabular">{formatMoney(Number(p.amount_minor), p.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="Credit adjustments" description="The business owner can see these too.">
        {d.adjustments.length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.adjustments.map((a, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {day(a.created_at)} · {a.reason}
                </span>
                <span className={`font-semibold tabular ${a.amount < 0 ? "text-neg-text" : "text-pos-text"}`}>
                  {a.amount > 0 ? "+" : ""}
                  {a.amount.toLocaleString()} → {a.balance_after.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <Languages id={d.id} name={d.name} enabled={d.local_languages} onDone={load} />

      <Suspend id={d.id} name={d.name} suspended={Boolean(d.suspended_at)} onDone={load} />
    </div>
  );
}

/** Sinhala and Tamil: on automatically for Sri Lankan businesses; switch it here for anyone else who asks. */
function Languages({ id, name, enabled, onDone }: { id: string; name: string; enabled: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function toggle() {
    setBusy(true);
    setMsg("");
    const r = await api(`/api/admin/businesses/${id}/languages`, { method: "POST", body: { enabled: !enabled } });
    setBusy(false);
    if (r.ok) onDone();
    else setMsg(r.message);
  }
  return (
    <SettingsSection
      title="Sinhala and Tamil"
      description="Lets this business show rating pages, the thank-you page, kiosks and survey emails in Sinhala or Tamil. On automatically for businesses that sign up or pay from Sri Lanka."
    >
      <div className="flex flex-wrap items-center gap-3">
        {enabled ? <Badge tone="pos">On for {name}</Badge> : <Badge tone="plain">Off</Badge>}
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={toggle}>
          {busy ? "Saving…" : enabled ? "Switch off" : "Switch on"}
        </button>
        {enabled && <p className="w-full text-[13px] text-muted">Switching off keeps existing Sinhala or Tamil surveys as they are; it only stops new ones.</p>}
      </div>
      {msg && (
        <div className="mt-3">
          <Notice kind="error">{msg}</Notice>
        </div>
      )}
    </SettingsSection>
  );
}

function Credits({ id, onDone }: { id: string; onDone: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const raw = String(f.get("crAmount") ?? "").trim();
    const parsed = adminCreditsSchema.safeParse({ amount: /^-?\d+$/.test(raw) ? Number(raw) : NaN, reason: String(f.get("crReason") ?? "") });
    if (!parsed.success) {
      const er = fieldErrors(parsed.error);
      return setErrors({ crAmount: er.amount ?? "", crReason: er.reason ?? "" });
    }
    const ok = await confirmDialog({
      title: parsed.data.amount > 0 ? `Add ${parsed.data.amount.toLocaleString()} responses?` : `Remove ${Math.abs(parsed.data.amount).toLocaleString()} responses?`,
      body: `Reason: ${parsed.data.reason}. The business owner can see this.`,
      confirmLabel: parsed.data.amount > 0 ? "Add responses" : "Remove responses",
      danger: parsed.data.amount < 0,
    });
    if (!ok) return;
    setErrors({});
    setBusy(true);
    const r = await api<{ balance: number }>(`/api/admin/businesses/${id}/credits`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      form.reset();
      setMsg({ kind: "success", text: `Done. New balance: ${r.data.balance.toLocaleString()}.` });
      onDone();
    } else setMsg({ kind: "error", text: r.message });
  }
  return (
    <SettingsSection title="Add or remove responses" description="For goodwill or corrections. Use a minus sign to remove.">
      <form onSubmit={onSubmit} noValidate className="space-y-3">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <Field label="Amount" name="crAmount" error={errors.crAmount || undefined}>
            <TextInput name="crAmount" inputMode="numeric" placeholder="e.g. 500" maxLength={8} error={errors.crAmount || undefined} />
          </Field>
          <Field label="Reason" name="crReason" error={errors.crReason || undefined}>
            <TextInput name="crReason" placeholder="e.g. Goodwill after outage" maxLength={300} error={errors.crReason || undefined} />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Apply"}
        </button>
      </form>
    </SettingsSection>
  );
}

function Suspend({ id, name, suspended, onDone }: { id: string; name: string; suspended: boolean; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!suspended && reason.trim().length < 3) return setMsg({ kind: "error", text: "Give a reason (at least 3 characters)." });
    const ok = await confirmDialog(
      suspended
        ? { title: `Restore ${name}?`, body: "They'll start collecting ratings again straight away.", confirmLabel: "Restore" }
        : { title: `Suspend ${name}?`, body: "Their rating links, QR codes, widget and kiosks stop collecting ratings. They can still sign in and export their data.", confirmLabel: "Suspend", danger: true },
    );
    if (!ok) return;
    setBusy(true);
    const r = await api(`/api/admin/businesses/${id}/suspend`, { method: "POST", body: { suspend: !suspended, reason: suspended ? "" : reason } });
    setBusy(false);
    if (r.ok) {
      setReason("");
      setMsg(null);
      onDone();
    } else setMsg({ kind: "error", text: r.message });
  }
  return (
    <SettingsSection title={suspended ? "Restore this business" : "Suspend this business"} danger={!suspended}>
      <div className="space-y-3">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {!suspended && (
          <Field label="Reason" name="susReason">
            <TextInput name="susReason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Chargeback under investigation" />
          </Field>
        )}
        <button type="button" className={suspended ? "btn btn-primary" : "btn btn-danger"} disabled={busy} onClick={run}>
          {suspended ? "Restore" : "Suspend"}
        </button>
      </div>
    </SettingsSection>
  );
}
