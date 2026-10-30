"use client";
import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { forgotPasswordSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, Notice, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";

const LINK_ERRORS: Record<string, string> = {
  link: "That reset link is invalid or has expired. Request a new one below.",
  busy: "Too many attempts. Wait a minute and try again.",
};

function ForgotForm() {
  const params = useSearchParams();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(LINK_ERRORS[params.get("error") ?? ""] ?? "");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email: String(new FormData(e.currentTarget).get("email") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError("");
    setBusy(true);
    const res = await api<{ message: string }>("/api/auth/forgot", { method: "POST", body: parsed.data });
    setBusy(false);
    if (res.ok) setSent(res.data.message);
    else setError(res.message);
  }

  if (sent) return <Notice kind="success">{sent}</Notice>;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && <Notice kind="error">{error}</Notice>}
      <Field label="Email" name="email" error={errors.email}>
        <TextInput name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required error={errors.email} />
      </Field>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? <Busy>Sending…</Busy> : "Send reset link"}
      </button>
    </form>
  );
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="link">
            Back to sign in
          </Link>
        </>
      }
    >
      <Suspense>
        <ForgotForm />
      </Suspense>
    </AuthShell>
  );
}
