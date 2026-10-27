"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { accountCreateSchema, fieldErrors } from "@/lib/validation/schemas";
import { ROLE_DESCRIPTION, ROLE_LABEL, isRole } from "@/lib/security/authz";
import { Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";

type Invite = { id: string; accountName: string; role: string; agentName: string | null; invitedAt: string; expiresAt: string };

export function WelcomeClient({ email, hasAccounts, ownsAccount }: { email: string; hasAccounts: boolean; ownsAccount: boolean }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoadError("");
    api<Invite[]>("/api/invites").then((r) => (r.ok ? setInvites(r.data) : setLoadError(r.message)));
  }, []);
  useEffect(load, [load]);

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    setError("");
    const r = await api<{ accountId?: string }>(`/api/invites/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    setBusyId("");
    if (!r.ok) return setError(r.message);
    if (action === "accept") window.location.assign("/app");
    else setInvites((list) => list?.filter((i) => i.id !== id) ?? null);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-bold leading-tight">{hasAccounts ? "Your invites" : "Welcome to TapRate"}</h1>
        <p className="mt-1 text-muted">
          Signed in as <strong className="break-all text-ink">{email}</strong>
        </p>
      </header>

      {loadError && <LoadError message={loadError} onRetry={load} />}
      {error && <Notice kind="error">{error}</Notice>}

      {invites === null && !loadError ? (
        <Skeleton className="h-28 w-full rounded-[var(--radius-panel)]" />
      ) : invites && invites.length > 0 ? (
        <ul className="space-y-3">
          {invites.map((i) => (
            <li key={i.id} className="panel p-5">
              <p className="font-display text-lg font-semibold">{i.accountName}</p>
              <p className="mt-1 text-sm text-muted">
                Invited as <strong className="text-ink">{isRole(i.role) ? ROLE_LABEL[i.role] : i.role}</strong>
                {i.agentName ? ` (${i.agentName})` : ""}. {isRole(i.role) ? ROLE_DESCRIPTION[i.role] : ""}
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn btn-primary" disabled={busyId === i.id} onClick={() => respond(i.id, "accept")}>
                  {busyId === i.id ? "Joining…" : "Accept and join"}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busyId === i.id} onClick={() => respond(i.id, "decline")}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : invites ? (
        <div className="panel p-5 text-sm text-muted">
          No pending invites for this email. If you expected one, ask your teammate to check they used <strong className="text-ink">{email}</strong>, and that
          you&rsquo;ve confirmed this email address.
        </div>
      ) : null}

      {hasAccounts && (
        <Link href="/app" className="btn btn-secondary">
          Go to your dashboard
        </Link>
      )}
      {!ownsAccount && <CreateAccount />}
    </div>
  );
}

function CreateAccount() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = accountCreateSchema.safeParse({ name: String(new FormData(e.currentTarget).get("name") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api("/api/account/create", { method: "POST", body: parsed.data });
    if (r.ok) {
      window.location.assign("/app");
      return;
    }
    setBusy(false);
    setErrors(r.fields ?? {});
    setError(r.message);
  }

  return (
    <section className="border-t border-line pt-8" aria-labelledby="create-title">
      <h2 id="create-title" className="text-lg font-semibold">
        Or start your own business account
      </h2>
      <p className="mt-1 text-sm text-muted">Collect ratings for your own business. You can still join teams you&rsquo;re invited to.</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Business name" name="name" error={errors.name}>
          <TextInput name="name" autoComplete="organization" maxLength={80} error={errors.name} />
        </Field>
        <button className="btn btn-secondary" disabled={busy}>
          {busy ? "Creating…" : "Create business account"}
        </button>
      </form>
    </section>
  );
}
