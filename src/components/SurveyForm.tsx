"use client";
import { useState, type FormEvent } from "react";
import { surveyCreateSchema, surveyUpdateSchema, fieldErrors } from "@/lib/validation/schemas";
import { ICON_SETS, ICON_SET_IDS, type IconSetId } from "@/lib/surveys/iconSets";
import type { Survey } from "@/lib/client/types";
import { Field, FormMessage, TextInput } from "@/components/ui";

type Props = {
  initial?: Survey;
  hasResponses?: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> }>;
  submitLabel: string;
};

export function SurveyForm({ initial, hasResponses, onSubmit, submitLabel }: Props) {
  const [iconSet, setIconSet] = useState<IconSetId>(initial?.iconSet ?? "faces5");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = ICON_SETS[iconSet];

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const threshold = String(f.get("alertThreshold") ?? "");
    const emails = String(f.get("alertEmails") ?? "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const values = {
      name: String(f.get("name") ?? ""),
      question: String(f.get("question") ?? ""),
      iconSet,
      brandColor: String(f.get("brandColor") ?? ""),
      thankYouMessage: String(f.get("thankYouMessage") ?? ""),
      allowComment: f.get("allowComment") === "on",
      websiteUrl: String(f.get("websiteUrl") ?? "").trim() || null,
      alertThreshold: threshold === "" ? null : Number(threshold),
      alertEmails: emails,
      status: String(f.get("status") ?? "active"),
    };

    const schema = initial ? surveyUpdateSchema : surveyCreateSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setMessage({ kind: "error", text: "Please fix the highlighted fields." });
      return;
    }
    setErrors({});
    setMessage(null);
    setBusy(true);
    const res = await onSubmit(parsed.data as Record<string, unknown>);
    setBusy(false);
    if (res.ok) {
      setMessage({ kind: "success", text: "Saved." });
    } else {
      setErrors(res.fields ?? {});
      setMessage({ kind: "error", text: res.message ?? "Could not save." });
    }
  }

  return (
    <form onSubmit={handle} noValidate className="panel space-y-5 p-6">
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Survey name (only you see this)" name="name" error={errors.name}>
          <TextInput name="name" defaultValue={initial?.name} maxLength={80} required error={errors.name} />
        </Field>
        <Field label="Status" name="status" error={errors.status}>
          <select id="status" name="status" className="input" defaultValue={initial?.status ?? "active"}>
            <option value="active">Active — collecting responses</option>
            <option value="paused">Paused — links show “survey closed”</option>
          </select>
        </Field>
      </div>

      <Field label="Question" name="question" error={errors.question}>
        <TextInput name="question" defaultValue={initial?.question ?? "How did we do?"} maxLength={200} required error={errors.question} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Rating scale</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ICON_SET_IDS.map((id) => (
            <label
              key={id}
              className={`panel flex cursor-pointer flex-col gap-1 p-3 ${iconSet === id ? "outline outline-2 outline-[var(--ink)]" : ""} ${hasResponses && id !== initial?.iconSet ? "opacity-40" : ""}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="iconSetRadio"
                  value={id}
                  checked={iconSet === id}
                  disabled={hasResponses && id !== initial?.iconSet}
                  onChange={() => setIconSet(id)}
                />
                {ICON_SETS[id].name}
              </span>
              <span className="text-lg">{ICON_SETS[id].options.map((o) => o.symbol).join(" ")}</span>
            </label>
          ))}
        </div>
        {hasResponses && <p className="text-xs text-[var(--muted)]">The scale is locked because this survey already has responses.</p>}
        {errors.iconSet && <p className="text-xs text-[var(--danger)]">{errors.iconSet}</p>}
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Brand colour" name="brandColor" error={errors.brandColor}>
          <TextInput name="brandColor" type="color" defaultValue={initial?.brandColor ?? "#2563eb"} className="input h-10 p-1" error={errors.brandColor} />
        </Field>
        <Field label="Your website (optional)" name="websiteUrl" error={errors.websiteUrl} hint="Shown as a link on the thank-you page. Must start with https://">
          <TextInput name="websiteUrl" type="url" defaultValue={initial?.websiteUrl ?? ""} maxLength={300} error={errors.websiteUrl} />
        </Field>
      </div>

      <Field label="Thank-you message" name="thankYouMessage" error={errors.thankYouMessage}>
        <TextInput name="thankYouMessage" defaultValue={initial?.thankYouMessage ?? "Thanks for your feedback!"} maxLength={300} error={errors.thankYouMessage} />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowComment" defaultChecked={initial?.allowComment ?? true} />
        Let customers add a comment after rating
      </label>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Alert me when the rating is at or below" name="alertThreshold" error={errors.alertThreshold}>
          <select id="alertThreshold" name="alertThreshold" className="input" defaultValue={initial?.alertThreshold ?? ""}>
            <option value="">No alerts</option>
            {set.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.symbol} {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alert emails" name="alertEmails" error={errors.alertEmails ?? errors["alertEmails.0"]} hint="Up to 10, separated by commas.">
          <TextInput name="alertEmails" defaultValue={initial?.alertEmails.join(", ") ?? ""} maxLength={2600} error={errors.alertEmails} />
        </Field>
      </div>

      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
