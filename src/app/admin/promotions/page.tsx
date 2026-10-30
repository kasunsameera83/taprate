"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { promotionSchema, THEMES, THEME_IDS, type PublicPromotion, type ThemeId } from "@/lib/site/content";
import { fieldErrors } from "@/lib/validation/schemas";
import { Badge, EmptyState, Field, LoadError, Notice, Segmented, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { GreetingBar, PromoPopup } from "@/components/site/Promotions";
import { Busy } from "@/components/FaceLoader";

type Promo = {
  id: string;
  kind: "popup" | "greeting";
  name: string;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  theme: ThemeId;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};
type Draft = Omit<Promo, "id" | "body" | "ctaLabel" | "ctaUrl"> & { id: string | null; body: string; ctaLabel: string; ctaUrl: string };

// <input type="datetime-local"> works in the computer's own time zone; we store ISO (UTC).
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function blank(kind: "popup" | "greeting"): Draft {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  return {
    id: null,
    kind,
    name: "",
    title: "",
    body: "",
    ctaLabel: kind === "popup" ? "See plans" : "",
    ctaUrl: kind === "popup" ? "/#pricing" : "",
    theme: "generic",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7 * 86_400_000).toISOString(),
    enabled: true,
  };
}

function status(p: Promo): { label: string; tone: "pos" | "neu" | "plain" } {
  const now = Date.now();
  if (!p.enabled) return { label: "Off", tone: "plain" };
  if (Date.parse(p.startsAt) > now) return { label: "Scheduled", tone: "neu" };
  if (Date.parse(p.endsAt) <= now) return { label: "Ended", tone: "plain" };
  return { label: "Live now", tone: "pos" };
}

export default function PromotionsPage() {
  const [items, setItems] = useState<Promo[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const load = useCallback(() => {
    setError("");
    api<Promo[]>("/api/admin/promotions").then((r) => (r.ok ? setItems(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Pop-ups &amp; greetings</h1>
          <p className="text-sm text-muted">A promotion pop-up, or a seasonal greeting bar across the top of the landing page, for the dates you choose. If two overlap, the newest one shows.</p>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(blank("greeting"))}>
              New greeting
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing(blank("popup"))}>
              New pop-up
            </button>
          </div>
        )}
      </div>

      {editing && (
        <Editor
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <SettingsSection title="All pop-ups and greetings">
        {error && <LoadError message={error} onRetry={load} />}
        {!items && !error && <Skeleton className="h-24 w-full" />}
        {items && items.length === 0 && <EmptyState title="Nothing yet" body="Create a seasonal greeting (Avurudu, Vesak, Christmas…) or a promotion pop-up." />}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((p) => {
              const s = status(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span aria-hidden>{THEMES[p.theme]?.emoji}</span>
                      {p.name}
                      <span className="text-[13px] font-normal text-muted">({p.kind === "popup" ? "pop-up" : "greeting"})</span>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </p>
                    <p className="text-[13px] text-muted">
                      {fmt(p.startsAt)} → {fmt(p.endsAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditing({ ...p, body: p.body ?? "", ctaLabel: p.ctaLabel ?? "", ctaUrl: p.ctaUrl ?? "" })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={async () => {
                        if (!(await confirmDialog({ title: `Delete “${p.name}”?`, body: "It will stop showing straight away.", confirmLabel: "Delete", danger: true }))) return;
                        const r = await api(`/api/admin/promotions/${p.id}`, { method: "DELETE" });
                        if (r.ok) load();
                        else setError(r.message);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}

function Editor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const preview: PublicPromotion = { id: "preview", kind: d.kind, title: d.title || "Your title", body: d.body || null, ctaLabel: d.ctaLabel || null, ctaUrl: d.ctaUrl || null, theme: d.theme };

  async function save() {
    const parsed = promotionSchema.safeParse({
      kind: d.kind,
      name: d.name,
      title: d.title,
      body: d.body,
      ctaLabel: d.ctaLabel,
      ctaUrl: d.ctaUrl,
      theme: d.theme,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      enabled: d.enabled,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api(d.id ? `/api/admin/promotions/${d.id}` : "/api/admin/promotions", { method: d.id ? "PUT" : "POST", body: parsed.data });
    setBusy(false);
    if (r.ok) onSaved();
    else {
      setErrors(r.fields ?? {});
      setMsg(r.message);
    }
  }

  return (
    <SettingsSection title={d.id ? "Edit" : d.kind === "popup" ? "New pop-up" : "New greeting"}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          {msg && <Notice kind="error">{msg}</Notice>}
          <Segmented
            label="Type"
            value={d.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: "popup", label: "Pop-up" },
              { value: "greeting", label: "Greeting bar" },
            ]}
          />
          <Field label="Internal name" name="pName" hint="Only you see this, e.g. “Avurudu 2027”." error={errors.name}>
            <TextInput name="pName" value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} hasHint error={errors.name} />
          </Field>
          <div className="space-y-1.5">
            <label htmlFor="pTheme" className="block text-sm font-semibold">
              Theme
            </label>
            <select id="pTheme" className="input" value={d.theme} onChange={(e) => set({ theme: e.target.value as ThemeId })}>
              {THEME_IDS.map((t) => (
                <option key={t} value={t}>
                  {THEMES[t].emoji} {THEMES[t].label}
                </option>
              ))}
            </select>
          </div>
          <Field label="Title" name="pTitle" error={errors.title}>
            <TextInput name="pTitle" value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} placeholder="e.g. Suba Aluth Avuruddak Wewa!" error={errors.title} />
          </Field>
          <div className="space-y-1.5">
            <label htmlFor="pBody" className="block text-sm font-semibold">
              Message <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="pBody" className="input min-h-20" value={d.body} maxLength={300} onChange={(e) => set({ body: e.target.value })} />
            {errors.body && <p className="text-[13px] font-medium text-neg-text">{errors.body}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button text" name="pCta" optional error={errors.ctaLabel}>
              <TextInput name="pCta" value={d.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} maxLength={30} error={errors.ctaLabel} />
            </Field>
            <Field label="Button link" name="pUrl" optional hint="https://… or a page like /#pricing" error={errors.ctaUrl}>
              <TextInput name="pUrl" value={d.ctaUrl} onChange={(e) => set({ ctaUrl: e.target.value })} maxLength={300} hasHint error={errors.ctaUrl} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" name="pStart" error={errors.startsAt}>
              <TextInput name="pStart" type="datetime-local" value={toLocal(d.startsAt)} onChange={(e) => set({ startsAt: fromLocal(e.target.value) })} error={errors.startsAt} />
            </Field>
            <Field label="Ends" name="pEnd" error={errors.endsAt}>
              <TextInput name="pEnd" type="datetime-local" value={toLocal(d.endsAt)} onChange={(e) => set({ endsAt: fromLocal(e.target.value) })} error={errors.endsAt} />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Switched on
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? <Busy>Saving…</Busy> : "Save"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Preview</p>
          <div className="rounded-[10px] border border-line bg-canvas p-4">{d.kind === "greeting" ? <GreetingBar promo={preview} preview /> : <PromoPopup promo={preview} preview />}</div>
          <p className="text-[13px] text-muted">Visitors see a pop-up once, 2–3 seconds after the page opens. A greeting stays until they close it.</p>
        </div>
      </div>
    </SettingsSection>
  );
}
