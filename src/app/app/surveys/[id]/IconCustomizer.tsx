"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { ICON_SETS } from "@/lib/surveys/iconSets";
import { canCustomizeIcons, checkIconImage, ICON_MAX_PX, ICON_MIN_PX, resolveOptions } from "@/lib/surveys/customIcons";
import { optionLabelsSchema, fieldErrors } from "@/lib/validation/schemas";
import { Notice } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";

// Your own pictures and words for the rating buttons. Every picture is checked here first (type from its
// bytes, size, dimensions, shape, not animated) and then checked again, cleaned and stored by the server.
export function IconCustomizer({ survey, canEdit, onChanged }: { survey: Survey; canEdit: boolean; onChanged: () => void }) {
  const set = ICON_SETS[survey.iconSet];
  const [labels, setLabels] = useState<Record<string, string>>(survey.optionLabels ?? {});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [labelErrors, setLabelErrors] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!canCustomizeIcons(survey.iconSet)) {
    return (
      <SettingsSection title="Your own pictures" description="Custom pictures and labels are available for the faces, thumbs and stars scales.">
        <p className="text-sm text-muted">This survey uses a number scale ({set.name}), which always shows numbers.</p>
      </SettingsSection>
    );
  }

  const preview = resolveOptions(survey.iconSet, { images: survey.iconImages, labels });
  const dirty = JSON.stringify(labels) !== JSON.stringify(survey.optionLabels ?? {});

  async function upload(value: number, file: File) {
    setMsg(null);
    // Same checks the server runs, so most problems are explained before anything is sent.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkIconImage(bytes);
    if (!check.ok) return setMsg({ kind: "error", text: check.reason });
    if (file.type && file.type !== check.type.mime) return setMsg({ kind: "error", text: "That file's name doesn't match what's inside it. Save it again as PNG, JPG or WebP." });
    setBusy(String(value));
    try {
      const res = await fetch(`/api/surveys/${encodeURIComponent(survey.id)}/icons/${value}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": check.type.mime },
        body: bytes,
      });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
      if (res.ok && json?.ok) {
        setMsg({ kind: "success", text: "Picture saved. It now shows on your buttons, rating pages and kiosks." });
        onChanged();
      } else setMsg({ kind: "error", text: json?.error?.message ?? "Upload failed. Please try again." });
    } catch {
      setMsg({ kind: "error", text: "Network problem. Check your connection and try again." });
    }
    setBusy(null);
  }

  async function removeImage(value: number, label: string) {
    if (!(await confirmDialog({ title: `Use the standard picture for “${label}”?`, body: "Your picture will be removed from this button.", confirmLabel: "Remove picture", danger: true }))) return;
    setBusy(String(value));
    const r = await api(`/api/surveys/${encodeURIComponent(survey.id)}/icons/${value}`, { method: "DELETE" });
    setBusy(null);
    if (r.ok) onChanged();
    else setMsg({ kind: "error", text: r.message });
  }

  async function saveLabels() {
    const parsed = optionLabelsSchema.safeParse(labels);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      return setLabelErrors(errs);
    }
    setLabelErrors({});
    setBusy("labels");
    const r = await api(`/api/surveys/${encodeURIComponent(survey.id)}`, { method: "PATCH", body: { optionLabels: parsed.data } });
    setBusy(null);
    if (r.ok) {
      setMsg({ kind: "success", text: "Labels saved." });
      onChanged();
    } else setMsg({ kind: "error", text: r.message });
  }

  return (
    <SettingsSection
      title="Your own pictures and labels"
      description={`Replace the standard ${set.id === "stars5" ? "stars" : set.id === "thumbs" ? "thumbs" : "faces"} with your own pictures (for example your mascot or product), and change the words under each button.`}
    >
      <div className="space-y-5">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <ul className="divide-y divide-line">
          {set.options.map((o) => {
            const key = String(o.value);
            const img = survey.iconImages?.[key];
            return (
              <li key={key} className="flex flex-wrap items-center gap-4 py-3">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[12px] border-2 bg-white" style={{ borderColor: o.color }}>
                  {img ? <img src={img} alt={`Your picture for ${o.label}`} className="h-12 w-12 object-contain" /> : <span className="text-3xl" aria-hidden>{set.id === "stars5" ? `${o.value}★` : o.symbol}</span>}
                </span>
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <label htmlFor={`label-${key}`} className="block text-[13px] font-semibold">
                    Label for rating {o.value} <span className="font-normal text-muted">(standard: {o.label})</span>
                  </label>
                  <input
                    id={`label-${key}`}
                    className="input"
                    value={labels[key] ?? ""}
                    placeholder={o.label}
                    maxLength={24}
                    disabled={!canEdit}
                    onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
                    aria-invalid={labelErrors[key] ? "true" : undefined}
                  />
                  {labelErrors[key] && <p className="text-[13px] font-medium text-neg-text">{labelErrors[key]}</p>}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={(el) => {
                        fileInputs.current[key] = el;
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) upload(o.value, f);
                      }}
                    />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => fileInputs.current[key]?.click()}>
                      {busy === key ? "Uploading…" : img ? "Replace picture" : "Upload picture"}
                    </button>
                    {img && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => removeImage(o.value, labels[key] || o.label)}>
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-[13px] text-muted">
          PNG, JPG or WebP, up to 200 KB, square, between {ICON_MIN_PX}×{ICON_MIN_PX} and {ICON_MAX_PX}×{ICON_MAX_PX} pixels (256×256 works well). Still images only.
          Hidden data such as location is removed. In emails the label is always shown too, so buttons still work when a mail app blocks pictures.
        </p>
        {canEdit && (
          <button type="button" className="btn btn-primary" disabled={!dirty || busy !== null} onClick={saveLabels}>
            {busy === "labels" ? "Saving…" : "Save labels"}
          </button>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">Preview</p>
          <div className="rounded-[12px] border border-line bg-canvas p-4">
            <p className="mb-3 text-center text-sm font-semibold">{survey.question}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {preview.map((o) => (
                <span key={o.value} className="flex min-h-20 min-w-20 flex-col items-center justify-center rounded-[12px] border-2 bg-white px-3" style={{ borderColor: o.color }}>
                  {o.imageUrl ? <img src={o.imageUrl} alt="" className="h-12 w-12 object-contain" /> : <span className="text-4xl" style={{ color: o.color }} aria-hidden>{set.id === "stars5" ? `${o.value}★` : o.symbol}</span>}
                  <span className="mt-0.5 text-[11px] font-semibold text-muted">{o.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
