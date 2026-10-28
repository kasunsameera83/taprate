"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { api } from "@/lib/client/api";
import { landingSchema, type Landing } from "@/lib/site/content";
import { fieldErrors } from "@/lib/validation/schemas";
import type { Catalog } from "@/lib/billing/catalog";
import { LoadError, Notice, Skeleton } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { LandingView } from "@/components/site/LandingView";

type Loaded = { draft: Landing; hasUnpublished: boolean; updatedAt: string | null; publishedAt: string | null };

// Plain text inputs only. What's typed is shown as text on the page, never as HTML.
function Input({ label, value, onChange, max, error, multiline }: { label: string; value: string; onChange: (v: string) => void; max: number; error?: string; multiline?: boolean }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex justify-between text-sm font-semibold">
        <span>{label}</span>
        <span className={`font-normal ${value.length > max ? "text-neg-text" : "text-muted"}`}>
          {value.length}/{max}
        </span>
      </label>
      {multiline ? (
        <textarea id={id} className="input min-h-20" value={value} maxLength={max * 2} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? "true" : undefined} />
      ) : (
        <input id={id} className="input" value={value} maxLength={max * 2} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? "true" : undefined} />
      )}
      {error && <p className="text-[13px] font-medium text-neg-text">{error}</p>}
    </div>
  );
}

function ListEditor<T extends Record<string, string>>({
  items,
  onChange,
  fields,
  max,
  addLabel,
  blank,
  errors,
  path,
}: {
  items: T[];
  onChange: (v: T[]) => void;
  fields: Array<{ key: keyof T & string; label: string; max: number; multiline?: boolean }>;
  max: number;
  addLabel: string;
  blank: T;
  errors: Record<string, string>;
  path: string;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="space-y-3 rounded-[10px] border border-line p-3">
          {fields.map((f) => (
            <Input
              key={f.key}
              label={`${f.label} ${i + 1}`}
              value={it[f.key] ?? ""}
              max={f.max}
              multiline={f.multiline}
              error={errors[`${path}.${i}.${f.key}`]}
              onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))}
            />
          ))}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move item ${i + 1} up`}>
              ↑
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move item ${i + 1} down`}>
              ↓
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      {errors[path] && <p className="text-[13px] font-medium text-neg-text">{errors[path]}</p>}
      {items.length < max && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...items, { ...blank }])}>
          {addLabel}
        </button>
      )}
    </div>
  );
}

export default function LandingEditor() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [c, setC] = useState<Landing | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(() => {
    setError("");
    api<Loaded>("/api/admin/landing").then((r) => {
      if (!r.ok) return setError(r.message);
      setLoaded(r.data);
      setC(r.data.draft);
      setDirty(false);
    });
    api<Catalog>("/api/admin/pricing").then((r) => r.ok && setCatalog(r.data));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!c || !loaded) return <Skeleton className="h-96 w-full rounded-[var(--radius-panel)]" />;

  const set = (patch: Partial<Landing>) => {
    setC({ ...c, ...patch });
    setDirty(true);
  };

  async function save(): Promise<boolean> {
    const parsed = landingSchema.safeParse(c);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setMsg({ kind: "error", text: "Some fields need attention (marked in red)." });
      return false;
    }
    setErrors({});
    setBusy(true);
    const r = await api("/api/admin/landing", { method: "PUT", body: parsed.data });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fields ?? {});
      setMsg({ kind: "error", text: r.message });
      return false;
    }
    setDirty(false);
    setLoaded({ ...loaded!, hasUnpublished: true });
    setMsg({ kind: "success", text: "Draft saved. Visitors still see the published version until you publish." });
    return true;
  }

  async function publish() {
    if (dirty && !(await save())) return;
    const ok = await confirmDialog({ title: "Publish the landing page?", body: "Everyone visiting the site will see these changes straight away.", confirmLabel: "Publish" });
    if (!ok) return;
    setBusy(true);
    const r = await api("/api/admin/landing/publish", { method: "POST" });
    setBusy(false);
    if (r.ok) {
      setLoaded({ ...loaded!, hasUnpublished: false, publishedAt: new Date().toISOString() });
      setMsg({ kind: "success", text: "Published. The landing page is updated." });
    } else setMsg({ kind: "error", text: r.message });
  }

  const e = errors;
  return (
    <div className="space-y-6">
      <div className="z-10 -mx-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/95 px-5 py-3 backdrop-blur sm:sticky sm:top-0">
        <div>
          <h1 className="text-[22px] font-bold leading-tight">Landing page</h1>
          <p className="text-[13px] text-muted">
            {dirty ? "Unsaved changes" : loaded.hasUnpublished ? "Draft saved, not published yet" : "Published version is up to date"}
            {loaded.publishedAt ? ` · last published ${new Date(loaded.publishedAt).toLocaleString()}` : " · never published (visitors see the default text)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? "Back to editing" : "Preview"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy || !dirty} onClick={save}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || (!dirty && !loaded.hasUnpublished)} onClick={publish}>
            Publish
          </button>
        </div>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {preview ? (
        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-canvas">
          <p className="border-b border-line bg-surface px-4 py-2 text-[13px] text-muted">Preview of your draft (links are live)</p>
          {catalog && <LandingView c={c} catalog={catalog} preview />}
        </div>
      ) : (
        <>
          <SettingsSection title="Top of the page">
            <div className="space-y-3">
              <Input label="Headline" value={c.hero.title} max={90} error={e["hero.title"]} onChange={(v) => set({ hero: { ...c.hero, title: v } })} />
              <Input label="Sub-headline" value={c.hero.subtitle} max={300} multiline error={e["hero.subtitle"]} onChange={(v) => set({ hero: { ...c.hero, subtitle: v } })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Main button" value={c.hero.primaryCta} max={30} error={e["hero.primaryCta"]} onChange={(v) => set({ hero: { ...c.hero, primaryCta: v } })} />
                <Input label="Small print under the buttons" value={c.hero.note} max={100} error={e["hero.note"]} onChange={(v) => set({ hero: { ...c.hero, note: v } })} />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="How it works">
            <div className="space-y-3">
              <Input label="Heading" value={c.stepsTitle} max={60} error={e.stepsTitle} onChange={(v) => set({ stepsTitle: v })} />
              <ListEditor
                items={c.steps}
                onChange={(steps) => set({ steps })}
                fields={[{ key: "title", label: "Step", max: 60 }, { key: "body", label: "Text", max: 300, multiline: true }]}
                max={6}
                addLabel="Add a step"
                blank={{ title: "", body: "" }}
                errors={e}
                path="steps"
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Features">
            <div className="space-y-3">
              <Input label="Heading" value={c.featuresTitle} max={60} error={e.featuresTitle} onChange={(v) => set({ featuresTitle: v })} />
              <ListEditor
                items={c.features}
                onChange={(features) => set({ features })}
                fields={[{ key: "title", label: "Feature", max: 60 }, { key: "body", label: "Text", max: 300, multiline: true }]}
                max={9}
                addLabel="Add a feature"
                blank={{ title: "", body: "" }}
                errors={e}
                path="features"
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Trust box">
            <div className="space-y-3">
              <Input label="Heading" value={c.trust.title} max={60} error={e["trust.title"]} onChange={(v) => set({ trust: { ...c.trust, title: v } })} />
              <Input label="Text" value={c.trust.body} max={300} multiline error={e["trust.body"]} onChange={(v) => set({ trust: { ...c.trust, body: v } })} />
            </div>
          </SettingsSection>

          <SettingsSection title="Pricing section" description="Prices themselves are edited on the Pricing tab.">
            <div className="space-y-3">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={c.pricing.show} onChange={(ev) => set({ pricing: { ...c.pricing, show: ev.target.checked } })} />
                Show prices on the landing page
              </label>
              <Input label="Heading" value={c.pricing.title} max={60} error={e["pricing.title"]} onChange={(v) => set({ pricing: { ...c.pricing, title: v } })} />
              <Input label="Text" value={c.pricing.subtitle} max={200} multiline error={e["pricing.subtitle"]} onChange={(v) => set({ pricing: { ...c.pricing, subtitle: v } })} />
            </div>
          </SettingsSection>

          <SettingsSection title="Questions (FAQ)">
            <div className="space-y-3">
              <Input label="Heading" value={c.faqTitle} max={60} error={e.faqTitle} onChange={(v) => set({ faqTitle: v })} />
              <ListEditor
                items={c.faq}
                onChange={(faq) => set({ faq })}
                fields={[{ key: "q", label: "Question", max: 140 }, { key: "a", label: "Answer", max: 600, multiline: true }]}
                max={12}
                addLabel="Add a question"
                blank={{ q: "", a: "" }}
                errors={e}
                path="faq"
              />
            </div>
          </SettingsSection>

          <SettingsSection title="Closing call to action and footer">
            <div className="space-y-3">
              <Input label="Closing headline" value={c.finalCta.title} max={90} error={e["finalCta.title"]} onChange={(v) => set({ finalCta: { ...c.finalCta, title: v } })} />
              <Input label="Closing button" value={c.finalCta.button} max={30} error={e["finalCta.button"]} onChange={(v) => set({ finalCta: { ...c.finalCta, button: v } })} />
              <Input label="Footer text" value={c.footer.tagline} max={120} error={e["footer.tagline"]} onChange={(v) => set({ footer: { tagline: v } })} />
            </div>
          </SettingsSection>

          <SettingsSection title="Search engines" description="What Google shows for your site.">
            <div className="space-y-3">
              <Input label="Page title" value={c.seo.title} max={70} error={e["seo.title"]} onChange={(v) => set({ seo: { ...c.seo, title: v } })} />
              <Input label="Description" value={c.seo.description} max={160} multiline error={e["seo.description"]} onChange={(v) => set({ seo: { ...c.seo, description: v } })} />
            </div>
          </SettingsSection>
        </>
      )}
    </div>
  );
}
