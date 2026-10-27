"use client";
import { useState, type FormEvent } from "react";
import { surveyCreateSchema, surveyUpdateSchema, fieldErrors } from "@/lib/validation/schemas";
import { ICON_SETS, ICON_SET_IDS, type IconSetId } from "@/lib/surveys/iconSets";
import type { Survey } from "@/lib/client/types";
import { Field, Notice, Segmented, TextInput } from "@/components/ui";
import { EmailButtonsPreview, EmailFrame, ThanksPreview } from "@/components/SurveyPreview";
import { ChipListInput } from "@/components/ChipListInput";

const DEFAULT_POSITIVE = ["Fast reply", "Friendly", "Solved my problem", "Easy to understand"];
const DEFAULT_NEGATIVE = ["Slow reply", "Not solved", "Hard to understand", "Unfriendly"];

type Props = {
  initial?: Survey;
  hasResponses?: boolean;
  canEdit?: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> }>;
  submitLabel: string;
};

const SCALE_HELP: Record<IconSetId, string> = {
  faces5: "Most detail. Good default for support.",
  faces3: "Quick and simple.",
  thumbs: "Yes / no. Highest response rate.",
  stars5: "Familiar from reviews.",
  nps: "Measures loyalty: how likely to recommend.",
  ces: "Measures effort: how easy it was to get help.",
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div>
        <legend className="font-display text-lg font-semibold">{title}</legend>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

export function SurveyForm({ initial, hasResponses, canEdit = true, onSubmit, submitLabel }: Props) {
  const [iconSet, setIconSet] = useState<IconSetId>(initial?.iconSet ?? "faces5");
  const [question, setQuestion] = useState(initial?.question ?? "How did we do?");
  const [message, setMessage] = useState(initial?.thankYouMessage ?? "Thanks for your feedback!");
  const [brandColor, setBrandColor] = useState(initial?.brandColor ?? "#2f3bf5");
  const [allowComment, setAllowComment] = useState(initial?.allowComment ?? true);
  // New surveys default to alerting on negative ratings; existing surveys keep their setting.
  const [threshold, setThreshold] = useState<string>(
    initial ? (initial.alertThreshold === null ? "" : String(initial.alertThreshold)) : String(ICON_SETS.faces5.negativeTo),
  );
  const [preview, setPreview] = useState<"email" | "thanks">("email");
  const [driversPositive, setDriversPositive] = useState<string[]>(initial ? initial.driversPositive : DEFAULT_POSITIVE);
  const [driversNegative, setDriversNegative] = useState<string[]>(initial ? initial.driversNegative : DEFAULT_NEGATIVE);
  const [reviewOn, setReviewOn] = useState(Boolean(initial?.reviewCtaUrl));
  const [followupsEnabled, setFollowupsEnabled] = useState(initial?.followupsEnabled ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = ICON_SETS[iconSet];

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const emails = String(f.get("alertEmails") ?? "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const values = {
      name: String(f.get("name") ?? ""),
      question,
      iconSet,
      brandColor,
      thankYouMessage: message,
      allowComment,
      websiteUrl: String(f.get("websiteUrl") ?? "").trim() || null,
      alertThreshold: threshold === "" ? null : Number(threshold),
      alertEmails: emails,
      status: String(f.get("status") ?? "active"),
      driversPositive,
      driversNegative,
      reviewCtaLabel: reviewOn ? String(f.get("reviewCtaLabel") ?? "") : null,
      reviewCtaUrl: reviewOn ? String(f.get("reviewCtaUrl") ?? "").trim() : null,
      followupsEnabled,
      followupDueHours: Number(f.get("followupDueHours") ?? 48),
    };

    // Same schemas as the server: instant feedback here, the real check happens in the API.
    const schema = initial ? surveyUpdateSchema : surveyCreateSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setNotice({ kind: "error", text: "Some fields need attention. They're marked below." });
      return;
    }
    setErrors({});
    setNotice(null);
    setBusy(true);
    const res = await onSubmit(parsed.data as Record<string, unknown>);
    setBusy(false);
    if (res.ok) setNotice({ kind: "success", text: "Changes saved." });
    else {
      setErrors(res.fields ?? {});
      setNotice({ kind: "error", text: res.message ?? "Couldn't save. Please try again." });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={handle} noValidate className="panel space-y-6 p-5 sm:p-7">
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        {!canEdit && <Notice kind="info">You have view-only access. Ask the account owner to make changes.</Notice>}

        <fieldset disabled={!canEdit || busy} className="space-y-6">
          <Section title="Question">
            <Field label="Survey name" name="name" error={errors.name} hint="Only your team sees this, e.g. “Support tickets”.">
              <TextInput name="name" defaultValue={initial?.name} maxLength={80} required error={errors.name} hasHint />
            </Field>
            <Field label="Question customers see" name="question" error={errors.question}>
              <TextInput name="question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} required error={errors.question} />
            </Field>
          </Section>

          <Section title="Rating scale" description={hasResponses ? "Locked because this survey already has ratings." : undefined}>
            <div role="radiogroup" aria-label="Rating scale" className="grid gap-2 sm:grid-cols-2">
              {ICON_SET_IDS.map((id) => {
                const locked = Boolean(hasResponses && id !== initial?.iconSet);
                const active = iconSet === id;
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer gap-3 rounded-[12px] border p-3 transition-colors ${
                      active ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong"
                    } ${locked ? "cursor-not-allowed opacity-45" : ""}`}
                  >
                    <input type="radio" name="iconSetRadio" value={id} checked={active} disabled={locked} onChange={() => {
                        setIconSet(id);
                        // Keep the alert level valid for the new scale.
                        setThreshold((t) => (t === "" ? "" : String(ICON_SETS[id].negativeTo)));
                      }} className="mt-1 h-4 w-4 accent-[var(--color-brand)]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{ICON_SETS[id].name}</span>
                      <span className="block truncate text-base" aria-hidden>
                        {id === "stars5" ? "★★★★★" : id === "nps" ? "0 1 2 … 10" : id === "ces" ? "1 2 3 … 7" : ICON_SETS[id].options.map((o) => o.symbol).join(" ")}
                      </span>
                      <span className="block text-[13px] text-muted">{SCALE_HELP[id]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.iconSet && <p className="text-[13px] text-neg-text">{errors.iconSet}</p>}
          </Section>

          <Section title="After they click" description="Customers land on a thank-you page with your message.">
            <Field label="Thank-you message" name="thankYouMessage" error={errors.thankYouMessage}>
              <TextInput name="thankYouMessage" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} error={errors.thankYouMessage} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <Field label="Brand colour" name="brandColor" error={errors.brandColor}>
                <div className="flex items-center gap-2">
                  <input
                    id="brandColor"
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-[10px] border border-control bg-white p-1"
                    aria-describedby={errors.brandColor ? "brandColor-error" : undefined}
                  />
                  <span className="tabular text-sm text-muted">{brandColor}</span>
                </div>
              </Field>
              <Field label="Link back to your website" name="websiteUrl" optional error={errors.websiteUrl} hint="Must start with https://">
                <TextInput name="websiteUrl" type="url" inputMode="url" placeholder="https://yourbusiness.lk" defaultValue={initial?.websiteUrl ?? ""} maxLength={300} error={errors.websiteUrl} hasHint />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Ask for an optional comment after rating
            </label>
          </Section>

          <Section title="Reasons" description="After rating, customers can tap why. Shown as one-tap buttons; leave a list empty to skip it.">
            <ChipListInput
              label="When they're happy: what went well?"
              name="driversPositive"
              values={driversPositive}
              onChange={setDriversPositive}
              error={errors.driversPositive}
            />
            <ChipListInput
              label="When they're not: what could be better?"
              name="driversNegative"
              values={driversNegative}
              onChange={setDriversNegative}
              error={errors.driversNegative}
            />
          </Section>

          <Section title="Ask happy customers for a review" description="Show a button on the thank-you page, only after a positive rating.">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={reviewOn} onChange={(e) => setReviewOn(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Show a review button
            </label>
            {reviewOn && (
              <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                <Field label="Button text" name="reviewCtaLabel" error={errors.reviewCtaLabel}>
                  <TextInput name="reviewCtaLabel" defaultValue={initial?.reviewCtaLabel ?? "Review us on Google"} maxLength={40} error={errors.reviewCtaLabel} />
                </Field>
                <Field label="Link" name="reviewCtaUrl" error={errors.reviewCtaUrl} hint="Your Google, Facebook or Tripadvisor review page. Must start with https://">
                  <TextInput name="reviewCtaUrl" type="url" inputMode="url" placeholder="https://g.page/r/…/review" defaultValue={initial?.reviewCtaUrl ?? ""} maxLength={300} error={errors.reviewCtaUrl} hasHint />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Follow-ups" description="Turn every negative rating into a task, so no unhappy customer is forgotten.">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={followupsEnabled} onChange={(e) => setFollowupsEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Create a follow-up for every negative rating
            </label>
            {followupsEnabled && (
              <Field label="Follow up within" name="followupDueHours" error={errors.followupDueHours}>
                <select id="followupDueHours" name="followupDueHours" className="input sm:max-w-xs" defaultValue={String(initial?.followupDueHours ?? 48)}>
                  <option value="4">4 hours</option>
                  <option value="24">1 day</option>
                  <option value="48">2 days</option>
                  <option value="72">3 days</option>
                  <option value="168">1 week</option>
                </select>
              </Field>
            )}
          </Section>

          <Section title="Alerts" description="Get an email when a customer is unhappy, so you can follow up quickly.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Alert when the rating is" name="alertThreshold" error={errors.alertThreshold}>
                <select id="alertThreshold" name="alertThreshold" className="input" value={threshold} onChange={(e) => setThreshold(e.target.value)}>
                  <option value="">Never</option>
                  {set.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} or lower
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Send alerts to" name="alertEmails" error={errors.alertEmails ?? errors["alertEmails.0"]} hint="Up to 10 emails, separated by commas.">
                <TextInput name="alertEmails" inputMode="email" placeholder="you@business.lk" defaultValue={initial?.alertEmails.join(", ") ?? ""} maxLength={2600} error={errors.alertEmails} hasHint />
              </Field>
            </div>
          </Section>

          <Section title="Status">
            <select id="status" name="status" aria-label="Status" className="input sm:max-w-sm" defaultValue={initial?.status ?? "active"}>
              <option value="active">Active: collecting ratings</option>
              <option value="paused">Paused: buttons show “survey closed”</option>
            </select>
          </Section>
        </fieldset>

        {canEdit && (
          <div className="flex items-center gap-3 border-t border-line pt-6">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </button>
          </div>
        )}
      </form>

      <aside className="lg:sticky lg:top-8 lg:self-start" aria-label="Preview">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-semibold tracking-normal text-muted">Preview</h2>
          <Segmented
            label="Preview"
            size="sm"
            value={preview}
            onChange={setPreview}
            options={[
              { value: "email", label: "Email" },
              { value: "thanks", label: "Thank-you page" },
            ]}
          />
        </div>
        {preview === "email" ? (
          <EmailFrame>
            <EmailButtonsPreview iconSet={iconSet} question={question} />
          </EmailFrame>
        ) : (
          <ThanksPreview
            question={question}
            message={message}
            brandColor={brandColor}
            allowComment={allowComment}
            drivers={driversPositive}
            reviewLabel={reviewOn ? "Review us" : null}
          />
        )}
        <p className="mt-3 text-[13px] text-muted">Buttons are plain text and colour, so they show even when images are blocked.</p>
      </aside>
    </div>
  );
}
