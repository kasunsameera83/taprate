"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { accountUpdateSchema, deleteAccountSchema, eraseCustomerSchema, fieldErrors } from "@/lib/validation/schemas";
import { canPerform, isRole, type Role } from "@/lib/security/authz";
import { Badge, Field, LoadError, Notice, PasswordInput, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { IconDownload } from "@/components/icons";

type Me = { account: { id: string; name: string; plan: string; credits: number; role: string } | null };

export default function BusinessSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => {
    setLoadError("");
    api<Me>("/api/account").then((r) => (r.ok ? setMe(r.data) : setLoadError(r.message)));
  }, []);
  useEffect(load, [load]);

  if (loadError) return <LoadError message={loadError} onRetry={load} />;
  if (!me?.account) return <Skeleton className="h-72 w-full rounded-[var(--radius-panel)]" />;
  const a = me.account;
  const role: Role | null = isRole(a.role) ? a.role : null;

  return (
    <div className="space-y-6">
      <SettingsSection title="Business details">
        <p className="mb-4 flex items-center gap-2 text-sm">
          <span className="capitalize">{a.plan} plan</span>
          <Badge tone="brand">{a.credits} responses left</Badge>
        </p>
        {canPerform(role, "account:write") ? <Rename current={a.name} onSaved={load} /> : <p className="text-sm font-semibold">{a.name}</p>}
      </SettingsSection>

      {canPerform(role, "account:export") && (
        <SettingsSection title="Export all data" description="Download everything for this business (surveys, ratings, comments, team) as a JSON file.">
          <a className="btn btn-secondary" href="/api/account/export">
            <IconDownload className="h-4 w-4" />
            Download export
          </a>
        </SettingsSection>
      )}

      {canPerform(role, "privacy:erase") && <EraseCustomer />}

      <Leave name={a.name} />

      {canPerform(role, "account:delete") && <DeleteAccount name={a.name} />}
    </div>
  );
}

function Rename({ current, onSaved }: { current: string; onSaved: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = accountUpdateSchema.safeParse({ name: String(new FormData(e.currentTarget).get("name") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api("/api/account", { method: "PATCH", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: "success", text: "Business name saved." });
      onSaved();
    } else {
      setErrors(r.fields ?? {});
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <Field label="Business name" name="name" error={errors.name} hint="Shown to customers on the thank-you page.">
        <TextInput name="name" defaultValue={current} maxLength={80} autoComplete="organization" error={errors.name} hasHint />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function EraseCustomer() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const parsed = eraseCustomerSchema.safeParse({ email: String(new FormData(formEl).get("eraseEmail") ?? "") });
    if (!parsed.success) return setErrors({ eraseEmail: fieldErrors(parsed.error).email ?? "" });
    if (!window.confirm(`Permanently delete every rating and comment from ${parsed.data.email}? This can't be undone.`)) return;
    setErrors({});
    setBusy(true);
    const r = await api<{ deleted: number }>("/api/privacy/erase", { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setNotice({ kind: "success", text: r.data.deleted === 0 ? "No ratings were stored for that email." : `Deleted ${r.data.deleted} ${r.data.deleted === 1 ? "rating" : "ratings"}.` });
    } else setNotice({ kind: "error", text: r.message });
  }
  return (
    <SettingsSection
      title="Delete a customer's data"
      description="When a customer asks you to erase their data (Sri Lanka's PDPA, GDPR), delete all their ratings and comments here."
    >
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        <Field label="Customer email" name="eraseEmail" error={errors.eraseEmail || undefined}>
          <TextInput name="eraseEmail" type="email" inputMode="email" autoComplete="off" maxLength={254} error={errors.eraseEmail || undefined} />
        </Field>
        <button className="btn btn-danger" disabled={busy}>
          {busy ? "Deleting…" : "Delete their data"}
        </button>
      </form>
    </SettingsSection>
  );
}

function Leave({ name }: { name: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <SettingsSection title="Leave this business" description={`You'll lose access to ${name}. Someone will need to invite you again to come back.`}>
      {error && (
        <div className="mb-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Leave ${name}?`)) return;
          setBusy(true);
          const r = await api("/api/account/leave", { method: "POST" });
          if (r.ok) window.location.assign("/app");
          else {
            setBusy(false);
            setError(r.message);
          }
        }}
      >
        {busy ? "Leaving…" : "Leave business"}
      </button>
    </SettingsSection>
  );
}

function DeleteAccount({ name }: { name: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = deleteAccountSchema.safeParse({ confirmName: String(f.get("confirmName") ?? ""), password: String(f.get("deletePassword") ?? "") });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      return setErrors({ confirmName: errs.confirmName ?? "", deletePassword: errs.password ?? "" });
    }
    if (parsed.data.confirmName.trim() !== name) return setErrors({ confirmName: "That doesn't match the business name" });
    setErrors({});
    setBusy(true);
    const r = await api("/api/account/delete", { method: "POST", body: parsed.data });
    if (r.ok) {
      window.location.assign("/welcome");
      return;
    }
    setBusy(false);
    setErrors({ confirmName: r.fields?.confirmName ?? "", deletePassword: r.fields?.password ?? "" });
    setError(r.fields ? "" : r.message);
  }
  return (
    <SettingsSection
      danger
      title="Delete this business"
      description="Permanently deletes every survey, rating, comment and team member. Buttons already in emails will stop working. This can't be undone."
    >
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <Field label={`Type “${name}” to confirm`} name="confirmName" error={errors.confirmName || undefined}>
          <TextInput name="confirmName" autoComplete="off" maxLength={200} error={errors.confirmName || undefined} />
        </Field>
        <Field label="Your password" name="deletePassword" error={errors.deletePassword || undefined}>
          <PasswordInput name="deletePassword" autoComplete="current-password" maxLength={128} error={errors.deletePassword || undefined} />
        </Field>
        <button className="btn btn-danger" disabled={busy}>
          {busy ? "Deleting…" : "Delete business permanently"}
        </button>
      </form>
    </SettingsSection>
  );
}
