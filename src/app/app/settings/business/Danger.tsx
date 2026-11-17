"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { deleteAccountSchema, eraseCustomerSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, Notice, PasswordInput, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Busy } from "@/components/FaceLoader";

// Privacy requests and the danger zone (moved from the Business page to Settings → Advanced).

export function EraseCustomer() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const parsed = eraseCustomerSchema.safeParse({ email: String(new FormData(formEl).get("eraseEmail") ?? "") });
    if (!parsed.success) return setErrors({ eraseEmail: fieldErrors(parsed.error).email ?? "" });
    if (!(await confirmDialog({ title: "Delete this customer's data?", body: `Every rating and comment from ${parsed.data.email} will be permanently deleted. This can't be undone.`, confirmLabel: "Delete data", danger: true }))) return;
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
          {busy ? <Busy>Deleting…</Busy> : "Delete their data"}
        </button>
      </form>
    </SettingsSection>
  );
}

export function Leave({ name }: { name: string }) {
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
          if (!(await confirmDialog({ title: `Leave ${name}?`, body: "You'll lose access until someone invites you again.", confirmLabel: "Leave", danger: true }))) return;
          setBusy(true);
          const r = await api("/api/account/leave", { method: "POST" });
          if (r.ok) window.location.assign("/app");
          else {
            setBusy(false);
            setError(r.message);
          }
        }}
      >
        {busy ? <Busy>Leaving…</Busy> : "Leave business"}
      </button>
    </SettingsSection>
  );
}

export function DeleteAccount({ name }: { name: string }) {
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
          {busy ? <Busy>Deleting…</Busy> : "Delete business permanently"}
        </button>
      </form>
    </SettingsSection>
  );
}
