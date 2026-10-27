"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { accountUpdateSchema, fieldErrors } from "@/lib/validation/schemas";
import { Field, FormMessage, TextInput } from "@/components/ui";

type Account = { name: string; plan: string; credits: number; createdAt: string; role: "owner" | "admin" | "viewer"; email: string | null };

export default function SettingsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    api<Account>("/api/account").then((r) => (r.ok ? setAccount(r.data) : setMessage({ kind: "error", text: r.message })));
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = accountUpdateSchema.safeParse({ name: String(new FormData(e.currentTarget).get("name") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const r = await api<{ name: string }>("/api/account", { method: "PATCH", body: parsed.data });
    if (r.ok) {
      setAccount((a) => (a ? { ...a, name: r.data.name } : a));
      setMessage({ kind: "success", text: "Saved." });
    } else {
      setErrors(r.fields ?? {});
      setMessage({ kind: "error", text: r.message });
    }
  }

  if (!account) return message ? <FormMessage kind="error">{message.text}</FormMessage> : <p className="text-[var(--muted)]">Loading…</p>;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="panel space-y-1 p-6 text-sm">
        <p>
          Signed in as <strong>{account.email}</strong> ({account.role})
        </p>
        <p>
          Plan: <strong>{account.plan}</strong> · {account.credits} responses left
        </p>
      </div>
      {account.role === "owner" ? (
        <form onSubmit={save} noValidate className="panel space-y-4 p-6">
          {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
          <Field label="Business name" name="name" error={errors.name}>
            <TextInput name="name" defaultValue={account.name} maxLength={80} error={errors.name} />
          </Field>
          <button className="btn btn-primary">Save</button>
        </form>
      ) : (
        <p className="text-sm text-[var(--muted)]">Only the account owner can change these settings.</p>
      )}
    </div>
  );
}
