"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { accountUpdateSchema, fieldErrors } from "@/lib/validation/schemas";
import { canPerform, isRole, type Role } from "@/lib/security/authz";
import Link from "next/link";
import { Badge, Field, LoadError, Notice, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { LOGO_MAX_BYTES, sniffImage } from "@/lib/branding";
import { TvScreens } from "./TvScreens";
import { DropAlerts } from "./DropAlerts";
import { BrandingSetting, IndustrySetting } from "./Extras";
import { PageLoader, Busy } from "@/components/FaceLoader";

type Me = { account: { id: string; name: string; plan: string; credits: number; role: string; logoUrl: string | null } | null };

export default function BusinessSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(() => {
    setLoadError("");
    api<Me>("/api/account").then((r) => (r.ok ? setMe(r.data) : setLoadError(r.message)));
  }, []);
  useEffect(load, [load]);

  if (loadError) return <LoadError message={loadError} onRetry={load} />;
  if (!me?.account) return <PageLoader className="h-72" />;
  const a = me.account;
  const role: Role | null = isRole(a.role) ? a.role : null;

  return (
    <div className="space-y-6">
      <SettingsSection title="Business details">
        <p className="mb-4 flex items-center gap-2 text-sm">
          <span className="capitalize">{a.plan} plan</span>
          <Badge tone="brand">{a.credits} responses left</Badge>
        </p>
        {canPerform(role, "account:write") ? <Rename current={a.name} onSaved={load} /> : <p className="text-sm font-semibold">{a.name}</p>}
      </SettingsSection>

      {canPerform(role, "account:write") && <Logo current={a.logoUrl} onChanged={load} />}

      <IndustrySetting canChange={canPerform(role, "account:write")} />

      <DropAlerts canChange={canPerform(role, "account:write")} />

      {canPerform(role, "account:write") && <BrandingSetting canChange />}

      {canPerform(role, "survey:write") && <TvScreens />}

      <p className="text-sm text-muted">
        Looking for your own domain, the do-not-email list, data export or deleting the business?{" "}
        <Link href="/app/settings/advanced" className="link">
          They&rsquo;re in Advanced
        </Link>
        .
      </p>
    </div>
  );
}

function Logo({ current, onChanged }: { current: string | null; onChanged: () => void }) {
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setNotice(null);
    // Quick checks here for instant feedback; the server checks the real file type and size again.
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setNotice({ kind: "error", text: "Choose a PNG, JPG or WebP image." });
    if (file.size > LOGO_MAX_BYTES) return setNotice({ kind: "error", text: "Logos must be 512 KB or smaller." });
    // Same byte check as the server, so a renamed file is caught before uploading.
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const type = sniffImage(head);
    if (!type || type.mime !== file.type) return setNotice({ kind: "error", text: "That file isn't really a PNG, JPG or WebP image." });
    setBusy(true);
    try {
      const res = await fetch("/api/account/logo", { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type }, body: file });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
      if (res.ok && json?.ok) {
        setNotice({ kind: "success", text: "Logo updated. It now shows on your thank-you pages." });
        onChanged();
      } else setNotice({ kind: "error", text: json?.error?.message ?? "Upload failed. Please try again." });
    } catch {
      setNotice({ kind: "error", text: "Network problem. Check your connection and try again." });
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const r = await api("/api/account/logo", { method: "DELETE" });
    setBusy(false);
    if (r.ok) onChanged();
    else setNotice({ kind: "error", text: r.message });
  }

  return (
    <SettingsSection title="Logo" description="Shown at the top of the thank-you page customers see after rating.">
      <div className="space-y-4">
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-44 items-center justify-center rounded-[10px] border border-dashed border-line-strong bg-canvas p-2">
            {current ? <img src={current} alt="Current logo" className="max-h-16 max-w-40 object-contain" /> : <span className="text-[13px] text-muted">No logo</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={`btn btn-secondary ${busy ? "pointer-events-none opacity-55" : ""}`}>
              {busy ? <Busy>Uploading…</Busy> : current ? "Replace logo" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload(file);
                }}
              />
            </label>
            {current && (
              <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="text-[13px] text-muted">PNG, JPG or WebP, up to 512 KB. A wide logo on a transparent background works best.</p>
      </div>
    </SettingsSection>
  );
}

function Rename({ current, onSaved }: { current: string; onSaved: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = accountUpdateSchema.safeParse({ name: String(new FormData(e.currentTarget).get("name") ?? "") });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api("/api/account", { method: "PATCH", body: parsed.data });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: "success", text: "Business name saved." });
      onSaved();
    } else {
      setErrors(r.fields ?? {});
      setNotice(r.fields ? null : { kind: "error", text: r.message });
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <Field label="Business name" name="name" error={errors.name} hint="Shown to customers on the thank-you page.">
        <TextInput name="name" defaultValue={current} maxLength={80} autoComplete="organization" error={errors.name} hasHint />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? <Busy>Saving…</Busy> : "Save"}
      </button>
    </form>
  );
}
