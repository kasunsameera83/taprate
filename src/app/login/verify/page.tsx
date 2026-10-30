"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { mfaCodeSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, Notice, TextInput } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";

// Only these destinations are allowed after verifying (no open redirect).
const NEXT: Record<string, string> = { reset: "/reset-password" };

function VerifyForm() {
  const params = useSearchParams();
  const next = NEXT[params.get("next") ?? ""] ?? "/app";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = mfaCodeSchema.safeParse({ code: String(new FormData(e.currentTarget).get("code") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError("");
    setBusy(true);
    const res = await api<{ verified: true }>("/api/auth/mfa/verify", { method: "POST", body: parsed.data });
    if (res.ok) {
      window.location.assign(next);
      return;
    }
    setBusy(false);
    if (res.status === 401) {
      window.location.assign("/login");
      return;
    }
    setErrors(res.fields ?? {});
    if (!res.fields) setError(res.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && <Notice kind="error">{error}</Notice>}
      <Field label="6-digit code" name="code" error={errors.code} hint="Open your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).">
        <TextInput
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          className="tabular text-center text-xl tracking-[0.3em]"
          error={errors.code}
          hasHint
        />
      </Field>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? <Busy>Checking…</Busy> : "Verify"}
      </button>
    </form>
  );
}

export default function VerifyPage() {
  return (
    <AuthShell
      title="Two-step verification"
      subtitle="Enter the code from your authenticator app."
      footer={
        <button
          type="button"
          className="link"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" });
            window.location.assign("/login");
          }}
        >
          Sign in with a different account
        </button>
      }
    >
      <Suspense>
        <VerifyForm />
      </Suspense>
    </AuthShell>
  );
}
