"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { signUpSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, FormMessage, TextInput } from "@/components/ui";

export default function SignupPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget; // React clears currentTarget after an await
    const form = new FormData(formEl);
    const input = {
      accountName: String(form.get("accountName") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));

    setErrors({});
    setMessage(null);
    setBusy(true);
    const res = await api<{ message: string }>("/api/auth/signup", { method: "POST", body: parsed.data });
    setBusy(false);
    if (res.ok) {
      setMessage({ kind: "success", text: res.data.message });
      formEl.reset();
      return;
    }
    setErrors(res.fields ?? {});
    setMessage({ kind: "error", text: res.message });
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-bold">Create your TapRate account</h1>
      <form onSubmit={onSubmit} noValidate className="panel space-y-4 p-6">
        {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
        <Field label="Business name" name="accountName" error={errors.accountName}>
          <TextInput name="accountName" autoComplete="organization" maxLength={80} required error={errors.accountName} />
        </Field>
        <Field label="Work email" name="email" error={errors.email}>
          <TextInput name="email" type="email" autoComplete="email" maxLength={254} required error={errors.email} />
        </Field>
        <Field label="Password" name="password" error={errors.password} hint="At least 10 characters, with a number or symbol.">
          <TextInput name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required error={errors.password} />
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </main>
  );
}
