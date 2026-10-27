"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { accountUpdateSchema, fieldErrors } from "@/lib/validation/schemas";
import { Badge, Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { IconShield } from "@/components/icons";

type Account = { name: string; plan: string; credits: number; createdAt: string; role: "owner" | "admin" | "viewer"; email: string | null };

const ROLE_TEXT: Record<Account["role"], string> = {
  owner: "Owner: full access, including account settings.",
  admin: "Admin: can create and edit surveys and export responses.",
  viewer: "Viewer: can see surveys and responses, but not change them.",
};

export default function SettingsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError("");
    api<Account>("/api/account").then((r) => (r.ok ? setAccount(r.data) : setLoadError(r.message)));
  }, []);
  useEffect(load, [load]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = accountUpdateSchema.safeParse({ name: String(new FormData(e.currentTarget).get("name") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api<{ name: string }>("/api/account", { method: "PATCH", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setAccount((a) => (a ? { ...a, name: r.data.name } : a));
      setNotice({ kind: "success", text: "Business name saved." });
    } else {
      setErrors(r.fields ?? {});
      setNotice({ kind: "error", text: r.message });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-[28px] font-bold leading-tight">Settings</h1>
        <p className="text-sm text-muted">Your account and business details.</p>
      </header>

      {loadError && <LoadError message={loadError} onRetry={load} />}
      {!account && !loadError && <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />}

      {account && (
        <>
          <section className="panel space-y-4 p-5 sm:p-6" aria-labelledby="acct-title">
            <h2 id="acct-title" className="text-lg font-semibold">
              Your access
            </h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Signed in as</dt>
                <dd className="break-all font-semibold">{account.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Role</dt>
                <dd className="font-semibold capitalize">{account.role}</dd>
                <dd className="text-[13px] text-muted">{ROLE_TEXT[account.role]}</dd>
              </div>
              <div>
                <dt className="text-muted">Plan</dt>
                <dd className="flex items-center gap-2 font-semibold capitalize">
                  {account.plan} <Badge tone="brand">{account.credits} responses left</Badge>
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="biz-title">
            <h2 id="biz-title" className="mb-4 text-lg font-semibold">
              Business details
            </h2>
            {account.role === "owner" ? (
              <form onSubmit={save} noValidate className="space-y-4">
                {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
                <Field label="Business name" name="name" error={errors.name}>
                  <TextInput name="name" defaultValue={account.name} maxLength={80} autoComplete="organization" error={errors.name} />
                </Field>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save business name"}
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted">Only the account owner can change business details.</p>
            )}
          </section>

          <section className="flex gap-3 rounded-[var(--radius-panel)] border border-line bg-brand-soft/50 p-5 text-sm" aria-labelledby="sec-title">
            <IconShield className="h-6 w-6 shrink-0 text-brand" />
            <div>
              <h2 id="sec-title" className="font-sans font-semibold tracking-normal">
                How we protect your data
              </h2>
              <p className="mt-1 text-muted">
                Every request is checked on our server. Your business&rsquo;s data is isolated at the database level, survey links are signed so they can&rsquo;t be
                forged, and clicks from email scanners are filtered out before they count.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
