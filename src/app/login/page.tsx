"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "@/lib/client/api";
import { signInSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, FormMessage, TextInput } from "@/components/ui";

const LINK_ERRORS: Record<string, string> = {
  link: "That confirmation link is invalid or has expired. Try signing in, or sign up again.",
  busy: "Too many attempts. Please wait a minute and try again.",
};

function LoginForm() {
  const params = useSearchParams();
  const linkError = LINK_ERRORS[params.get("error") ?? ""] ?? "";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(linkError);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };

    // Same schema as the server: instant feedback here, real check there.
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));

    setErrors({});
    setMessage("");
    setBusy(true);
    const res = await api<{ signedIn: true }>("/api/auth/login", { method: "POST", body: parsed.data });
    setBusy(false);
    if (res.ok) {
      window.location.assign("/app");
      return;
    }
    setErrors(res.fields ?? {});
    setMessage(res.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="panel space-y-4 p-6">
      <FormMessage kind="error">{message}</FormMessage>
      <Field label="Email" name="email" error={errors.email}>
        <TextInput name="email" type="email" autoComplete="email" maxLength={254} required error={errors.email} />
      </Field>
      <Field label="Password" name="password" error={errors.password}>
        <TextInput name="password" type="password" autoComplete="current-password" maxLength={128} required error={errors.password} />
      </Field>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Sign in to TapRate</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="mt-4 text-sm text-[var(--muted)]">
        New here?{" "}
        <Link href="/signup" className="font-medium text-[var(--accent)]">
          Create an account
        </Link>
      </p>
    </main>
  );
}
