"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { changeEmailSchema, mfaCodeSchema, mfaConfirmSchema, newPasswordSchema, fieldErrors } from "@/lib/validation/schemas";
import { ROLE_DESCRIPTION, ROLE_LABEL, isRole } from "@/lib/security/authz";
import { Badge, Field, LoadError, Notice, PasswordInput, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";

type Me = {
  email: string | null;
  mfaEnabled: boolean;
  account: { id: string; name: string; role: string; agentName: string | null } | null;
};

export default function AccountSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => {
    setLoadError("");
    api<Me>("/api/account").then((r) => (r.ok ? setMe(r.data) : setLoadError(r.message)));
  }, []);
  useEffect(load, [load]);

  if (loadError) return <LoadError message={loadError} onRetry={load} />;
  if (!me) return <Skeleton className="h-72 w-full rounded-[var(--radius-panel)]" />;

  const role = me.account?.role;
  return (
    <div className="space-y-6">
      <SettingsSection title="Your access">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Signed in as</dt>
            <dd className="break-all font-semibold">{me.email}</dd>
          </div>
          {me.account && role && isRole(role) && (
            <div>
              <dt className="text-muted">Role in {me.account.name}</dt>
              <dd className="font-semibold">
                {ROLE_LABEL[role]}
                {me.account.agentName ? ` (${me.account.agentName})` : ""}
              </dd>
              <dd className="text-[13px] text-muted">{ROLE_DESCRIPTION[role]}</dd>
            </div>
          )}
        </dl>
      </SettingsSection>
      <TwoFactor enabled={me.mfaEnabled} onChange={load} />
      <ChangePassword />
      <ChangeEmail current={me.email ?? ""} />
      <SignOutEverywhere />
    </div>
  );
}

/* ---------- Two-factor ---------- */

function TwoFactor({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const [setup, setSetup] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setNotice(null);
    const r = await api<{ factorId: string; qrCode: string; secret: string }>("/api/account/mfa/enroll", { method: "POST" });
    setBusy(false);
    if (r.ok) setSetup(r.data);
    else setNotice({ kind: "error", text: r.message });
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = mfaConfirmSchema.safeParse({ factorId: setup?.factorId, code: String(new FormData(e.currentTarget).get("code") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api("/api/account/mfa/confirm", { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setSetup(null);
      setNotice({ kind: "success", text: "Two-step verification is on. You'll enter a code from your app each time you sign in." });
      onChange();
    } else {
      setErrors(r.fields ?? {});
      if (!r.fields) setNotice({ kind: "error", text: r.message });
    }
  }

  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = mfaCodeSchema.safeParse({ code: String(new FormData(e.currentTarget).get("code") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api("/api/account/mfa/disable", { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setDisabling(false);
      setNotice({ kind: "success", text: "Two-step verification is off." });
      onChange();
    } else {
      setErrors(r.fields ?? {});
      if (!r.fields) setNotice({ kind: "error", text: r.message });
    }
  }

  return (
    <SettingsSection
      title="Two-step verification"
      description="Protects your account even if your password leaks: signing in also needs a code from an app on your phone."
    >
      <div className="space-y-4">
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        <p className="flex items-center gap-2 text-sm">
          Status: {enabled ? <Badge tone="pos">On</Badge> : <Badge tone="plain">Off</Badge>}
        </p>

        {!enabled && !setup && (
          <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Turn on two-step verification"}
          </button>
        )}

        {setup && (
          <div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
            {/* SVG data URL from Supabase, shown as an image (never inserted as HTML). */}
            <img src={setup.qrCode} alt="QR code to scan with your authenticator app" width={180} height={180} className="rounded-[10px] border border-line bg-white p-2" />
            <form onSubmit={confirm} noValidate className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
                <li>Scan the QR code, or enter this key: <code className="break-all rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">{setup.secret}</code></li>
                <li>Type the 6-digit code it shows.</li>
              </ol>
              <Field label="6-digit code" name="code" error={errors.code}>
                <TextInput name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="tabular max-w-40 tracking-[0.25em]" error={errors.code} />
              </Field>
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Checking…" : "Verify and turn on"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {enabled && !disabling && (
          <button type="button" className="btn btn-danger" onClick={() => setDisabling(true)}>
            Turn off
          </button>
        )}
        {enabled && disabling && (
          <form onSubmit={disable} noValidate className="space-y-4">
            <Field label="Enter a current code to turn it off" name="code" error={errors.code}>
              <TextInput name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="tabular max-w-40 tracking-[0.25em]" error={errors.code} />
            </Field>
            <div className="flex gap-2">
              <button className="btn btn-danger" disabled={busy}>
                {busy ? "Turning off…" : "Turn off two-step verification"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDisabling(false)}>
                Keep it on
              </button>
            </div>
          </form>
        )}
      </div>
    </SettingsSection>
  );
}

/* ---------- Password ---------- */

function ChangePassword() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = newPasswordSchema.safeParse({ currentPassword: String(f.get("currentPassword") ?? ""), newPassword: String(f.get("newPassword") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api("/api/auth/password", { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setNotice({ kind: "success", text: "Password changed. Other devices have been signed out." });
    } else {
      setErrors(r.fields ?? {});
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }

  return (
    <SettingsSection title="Password">
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        <Field label="Current password" name="currentPassword" error={errors.currentPassword}>
          <PasswordInput name="currentPassword" autoComplete="current-password" maxLength={128} error={errors.currentPassword} />
        </Field>
        <Field label="New password" name="newPassword" error={errors.newPassword} hint="At least 10 characters, with a number or symbol.">
          <PasswordInput name="newPassword" autoComplete="new-password" maxLength={128} error={errors.newPassword} hasHint />
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </SettingsSection>
  );
}

/* ---------- Email ---------- */

function ChangeEmail({ current }: { current: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = changeEmailSchema.safeParse({ email: String(f.get("email") ?? ""), currentPassword: String(f.get("emailPassword") ?? "") });
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      return setErrors({ email: errs.email ?? "", emailPassword: errs.currentPassword ?? "" });
    }
    setErrors({});
    setBusy(true);
    const r = await api<{ message: string }>("/api/account/email", { method: "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      formEl.reset();
      setNotice({ kind: "success", text: r.data.message });
    } else {
      setErrors({ email: r.fields?.email ?? "", emailPassword: r.fields?.currentPassword ?? "" });
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }

  return (
    <SettingsSection title="Sign-in email" description={<>Currently <strong className="break-all text-ink">{current}</strong>.</>}>
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        <Field label="New email" name="email" error={errors.email || undefined}>
          <TextInput name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} error={errors.email || undefined} />
        </Field>
        <Field label="Current password" name="emailPassword" error={errors.emailPassword || undefined}>
          <PasswordInput name="emailPassword" autoComplete="current-password" maxLength={128} error={errors.emailPassword || undefined} />
        </Field>
        <button className="btn btn-secondary" disabled={busy}>
          {busy ? "Sending…" : "Change email"}
        </button>
      </form>
    </SettingsSection>
  );
}

/* ---------- Sessions ---------- */

function SignOutEverywhere() {
  const [busy, setBusy] = useState(false);
  return (
    <SettingsSection title="Signed-in devices" description="Lost a phone or used a shared computer? Sign out of TapRate on every device at once.">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("Sign out on all devices, including this one?")) return;
          setBusy(true);
          await api("/api/account/sessions", { method: "DELETE" });
          window.location.assign("/login");
        }}
      >
        {busy ? "Signing out…" : "Sign out everywhere"}
      </button>
    </SettingsSection>
  );
}
