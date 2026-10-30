"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { newPasswordSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, Notice, PasswordInput } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";
import { Busy } from "@/components/FaceLoader";

export default function ResetPasswordPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const newPassword = String(f.get("newPassword") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    const parsed = newPasswordSchema.safeParse({ newPassword });
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (newPassword && confirm !== newPassword) errs.confirm = "The two passwords don't match";
    if (!parsed.success || errs.confirm) return setErrors(errs);

    setErrors({});
    setError("");
    setBusy(true);
    const res = await api<{ changed: true }>("/api/auth/password", { method: "POST", body: parsed.data });
    setBusy(false);
    if (res.ok) return setDone(true);
    // No session, or the 15-minute reset window has passed.
    if (res.status === 401 || res.fields?.currentPassword) return setExpired(true);
    setErrors(res.fields ?? {});
    setError(res.message);
  }

  const footer = (
    <Link href="/login" className="link">
      Back to sign in
    </Link>
  );

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You're signed in with your new password." footer={footer}>
        <Notice kind="success">Other devices that were signed in with the old password have been signed out.</Notice>
        <Link href="/app" className="btn btn-primary mt-5 w-full">
          Go to your dashboard
        </Link>
      </AuthShell>
    );
  }
  if (expired) {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links work once, for 15 minutes." footer={footer}>
        <Link href="/forgot-password" className="btn btn-primary w-full">
          Send a new reset link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use something you don't use anywhere else." footer={footer}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="New password" name="newPassword" error={errors.newPassword} hint="At least 10 characters, with a number or symbol.">
          <PasswordInput name="newPassword" autoComplete="new-password" minLength={10} maxLength={128} required error={errors.newPassword} hasHint />
        </Field>
        <Field label="Confirm new password" name="confirm" error={errors.confirm}>
          <PasswordInput name="confirm" autoComplete="new-password" maxLength={128} required error={errors.confirm} />
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? <Busy>Saving…</Busy> : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
