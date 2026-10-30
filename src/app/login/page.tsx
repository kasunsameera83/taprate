"use client";
import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { signInSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, Notice, PasswordInput, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";
import { ResendConfirmation } from "@/components/ResendConfirmation";
import { Busy } from "@/components/FaceLoader";

const LINK_ERRORS: Record<string, string> = {
  link: "That confirmation link is invalid or has expired. Try signing in, or sign up again.",
  busy: "Too many attempts. Wait a minute and try again.",
};

function LoginForm() {
  const params = useSearchParams();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(LINK_ERRORS[params.get("error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);
  // Set when the password was right but the email isn't confirmed yet: offer to send the link again.
  const [unconfirmed, setUnconfirmed] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };

    // Same schema as the server: instant feedback here, the real check happens there.
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));

    setErrors({});
    setMessage("");
    setBusy(true);
    const res = await api<{ signedIn: true; mfaRequired: boolean }>("/api/auth/login", { method: "POST", body: parsed.data });
    if (res.ok) {
      window.location.assign(res.data.mfaRequired ? "/login/verify" : "/app");
      return;
    }
    setBusy(false);
    const { unconfirmed: flag, ...fields } = res.fields ?? {};
    setUnconfirmed(flag ? parsed.data.email : "");
    setErrors(fields);
    setMessage(res.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {message && <Notice kind="error">{message}</Notice>}
      {unconfirmed && <ResendConfirmation email={unconfirmed} startWaiting={false} />}
      <Field label="Email" name="email" error={errors.email}>
        <TextInput name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required error={errors.email} />
      </Field>
      <Field label="Password" name="password" error={errors.password}>
        <PasswordInput name="password" autoComplete="current-password" maxLength={128} required error={errors.password} />
      </Field>
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="link text-sm">
          Forgot password?
        </Link>
      </div>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? <Busy>Signing in…</Busy> : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see how your customers rated you."
      footer={
        <>
          New to TapTruly?{" "}
          <Link href="/signup" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
