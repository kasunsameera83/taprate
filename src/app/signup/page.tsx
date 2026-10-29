"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { signUpSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, Notice, PasswordInput, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";
import { ResendConfirmation } from "@/components/ResendConfirmation";

export default function SignupPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  // Invite code from a referral link. Only a well-formed code is kept; the server checks it again.
  const [ref, setRef] = useState<string | undefined>();
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref")?.toUpperCase() ?? "";
    if (/^[A-Z2-9]{8}$/.test(code)) setRef(code);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget; // React clears currentTarget after an await
    const form = new FormData(formEl);
    const input = {
      accountName: String(form.get("accountName") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      acceptTerms: form.get("acceptTerms") === "on",
      ...(ref ? { ref } : {}),
    };
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));

    setErrors({});
    setMessage(null);
    setBusy(true);
    const res = await api<{ message: string }>("/api/auth/signup", { method: "POST", body: parsed.data });
    setBusy(false);
    if (res.ok) {
      setSentTo(parsed.data.email);
      formEl.reset();
      return;
    }
    setErrors(res.fields ?? {});
    setMessage({ kind: "error", text: res.message });
  }

  const footer = (
    <>
      Already have an account?{" "}
      <Link href="/login" className="link">
        Sign in
      </Link>
    </>
  );

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle="One more step to finish setting up." footer={footer}>
        <Notice kind="success">
          We sent a confirmation link to <strong className="break-all">{sentTo}</strong>. Open it to finish signing up (on this device or your phone). It can take a
          minute to arrive; check your spam folder if you don&rsquo;t see it.
        </Notice>
        <div className="mt-4">
          <ResendConfirmation email={sentTo} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Start collecting ratings" subtitle="Free to start. No card needed." footer={footer}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        {ref && <Notice kind="info">A friend invited you. You both get 250 bonus responses after your first payment.</Notice>}
        <Field label="Business name" name="accountName" error={errors.accountName}>
          <TextInput name="accountName" autoComplete="organization" maxLength={80} required error={errors.accountName} />
        </Field>
        <Field label="Work email" name="email" error={errors.email}>
          <TextInput name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required error={errors.email} />
        </Field>
        <Field label="Password" name="password" error={errors.password} hint="At least 10 characters, with a number or symbol.">
          <PasswordInput name="password" autoComplete="new-password" minLength={10} maxLength={128} required error={errors.password} hasHint />
        </Field>
        <div className="space-y-1">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="acceptTerms"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
              aria-invalid={errors.acceptTerms ? "true" : undefined}
              aria-describedby={errors.acceptTerms ? "acceptTerms-error" : undefined}
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="link">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="link">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms && (
            <p id="acceptTerms-error" className="text-[13px] font-medium text-neg-text">
              {errors.acceptTerms}
            </p>
          )}
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
