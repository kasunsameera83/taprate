"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { surveyCreateSchema, surveyUpdateSchema, fieldErrors } from "@/lib/validation/schemas";
import { ICON_SETS, ICON_SET_IDS, type IconSetId } from "@/lib/surveys/iconSets";
import type { Survey } from "@/lib/client/types";
import { Field, Notice, Segmented, TextInput } from "@/components/ui";
import { EmailButtonsPreview, EmailFrame, ThanksPreview } from "@/components/SurveyPreview";
import { ChipListInput } from "@/components/ChipListInput";
import { IconEye } from "@/components/icons";
import { canCustomizeIcons, checkIconImage, resolveOptions } from "@/lib/surveys/customIcons";
import { api } from "@/lib/client/api";
import { LANG_NAME, LANGS, pt, standardLabel, SURVEY_DEFAULTS, type Lang } from "@/lib/i18n/public";

/** A picture chosen while creating a survey: checked here, uploaded (and checked again) right after the survey is created. */
export type PendingIcon = { value: number; bytes: Uint8Array; mime: string };

const DEFAULT_POSITIVE = SURVEY_DEFAULTS.en.positive;
const DEFAULT_NEGATIVE = SURVEY_DEFAULTS.en.negative;

const DUE_OPTIONS = [
  { value: "4", label: "4 hours" },
  { value: "24", label: "1 day" },
  { value: "48", label: "2 days" },
  { value: "72", label: "3 days" },
  { value: "168", label: "1 week" },
];

type Props = {
  initial?: Survey;
  hasResponses?: boolean;
  canEdit?: boolean;
  onSubmit: (values: Record<string, unknown>, extras: { icons: PendingIcon[] }) => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> }>;
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

// Which part of the form each field lives in, so a part with an error opens by itself.
type Part = "basics" | "scale" | "thanks" | "unhappy" | "status";
const PART_OF: Record<string, Part> = {
  name: "basics",
  question: "basics",
  language: "basics",
  reasonsQuestionPositive: "thanks",
  reasonsQuestionNegative: "thanks",
  iconSet: "scale",
  optionLabels: "scale",
  thankYouMessage: "thanks",
  brandColor: "thanks",
  websiteUrl: "thanks",
  allowComment: "thanks",
  driversPositive: "thanks",
  driversNegative: "thanks",
  reviewCtaLabel: "thanks",
  reviewCtaUrl: "thanks",
  alertThreshold: "unhappy",
  alertEmails: "unhappy",
  followupsEnabled: "unhappy",
  followupDueHours: "unhappy",
  recoveryEmail: "unhappy",
  status: "status",
};
const partOf = (key: string) => PART_OF[key.split(".")[0] ?? ""];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-5 w-5 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One numbered part of the form. Optional parts can fold away and show a one-line summary of their
 * current settings instead. Folded content stays in the page (just hidden), so its values are still saved.
 */
function FormPart({
  id,
  step,
  title,
  description,
  summary,
  open,
  onToggle,
  onFocusCapture,
  children,
}: {
  id: string;
  step: number;
  title: string;
  description?: string;
  summary?: string;
  open?: boolean;
  onToggle?: () => void;
  onFocusCapture?: () => void;
  children: ReactNode;
}) {
  const collapsible = Boolean(onToggle);
  const shown = !collapsible || open;
  const heading = (
    <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand" aria-hidden>
        {step}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-semibold leading-snug text-ink">{title}</span>
        {collapsible && !open && summary ? (
          <span className="mt-0.5 block text-sm text-muted">{summary}</span>
        ) : (
          description && <span className="mt-0.5 block text-sm font-normal text-muted">{description}</span>
        )}
      </span>
    </span>
  );
  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-line pt-6 first:border-t-0 first:pt-0" onFocusCapture={onFocusCapture}>
      <h2 id={`${id}-title`} className="font-sans text-base tracking-normal">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`${id}-body`}
            className="-m-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-[12px] p-2 hover:bg-canvas"
          >
            {heading}
            <span className="flex items-center gap-1 pt-1 text-[13px] font-semibold text-brand">
              {open ? "Done" : "Edit"}
              <Chevron open={Boolean(open)} />
            </span>
          </button>
        ) : (
          heading
        )}
      </h2>
      <div id={`${id}-body`} hidden={!shown} className="mt-5 space-y-5 sm:pl-10">
        {children}
      </div>
    </section>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function SurveyForm({ initial, hasResponses, canEdit = true, onSubmit, submitLabel }: Props) {
  const creating = !initial;
  const [iconSet, setIconSet] = useState<IconSetId>(initial?.iconSet ?? "faces5");
  const [question, setQuestion] = useState(initial?.question ?? SURVEY_DEFAULTS.en.question);
  const [message, setMessage] = useState(initial?.thankYouMessage ?? SURVEY_DEFAULTS.en.thanks);
  const [language, setLanguage] = useState<Lang>(initial?.language ?? "en");
  const [langAvailable, setLangAvailable] = useState(false);
  const [reasonsQPos, setReasonsQPos] = useState(initial?.reasonsQuestionPositive ?? "");
  const [reasonsQNeg, setReasonsQNeg] = useState(initial?.reasonsQuestionNegative ?? "");
  const [brandColor, setBrandColor] = useState(initial?.brandColor ?? "#4f46e5");
  const [allowComment, setAllowComment] = useState(initial?.allowComment ?? true);
  // New surveys default to alerting on negative ratings; existing surveys keep their setting.
  const [threshold, setThreshold] = useState<string>(
    initial ? (initial.alertThreshold === null ? "" : String(initial.alertThreshold)) : String(ICON_SETS.faces5.negativeTo),
  );
  const [alertEmails, setAlertEmails] = useState(initial?.alertEmails.join(", ") ?? "");
  const [preview, setPreview] = useState<"email" | "thanks">("email");
  const [driversPositive, setDriversPositive] = useState<string[]>(initial ? initial.driversPositive : DEFAULT_POSITIVE);
  const [driversNegative, setDriversNegative] = useState<string[]>(initial ? initial.driversNegative : DEFAULT_NEGATIVE);
  const [reviewOn, setReviewOn] = useState(Boolean(initial?.reviewCtaUrl));
  const [followupsEnabled, setFollowupsEnabled] = useState(initial?.followupsEnabled ?? true);
  const [dueHours, setDueHours] = useState(String(initial?.followupDueHours ?? 48));
  const [recoveryEmail, setRecoveryEmail] = useState(initial?.recoveryEmail ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<Record<"thanks" | "unhappy", boolean>>({ thanks: false, unhappy: false });
  const set = ICON_SETS[iconSet];
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);

  // Own pictures and labels while creating (existing surveys use the editor under the form).
  const [showCustom, setShowCustom] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, { bytes: Uint8Array; mime: string; url: string }>>({});
  const [iconError, setIconError] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => Object.values(pendingRef.current).forEach((p) => URL.revokeObjectURL(p.url)), []);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, canEdit]);

  const changed = () => setDirty(true);

  // Sinhala and Tamil are offered to Sri Lankan businesses (or when the product owner switches them on).
  useEffect(() => {
    api<{ account: { localLanguages?: boolean } | null }>("/api/account").then((r) => r.ok && setLangAvailable(Boolean(r.data.account?.localLanguages)));
  }, []);

  /** New survey: swap the starting text to the new language, but never text the person already changed. */
  function changeLanguage(next: Lang) {
    const from = SURVEY_DEFAULTS[language];
    const to = SURVEY_DEFAULTS[next];
    if (creating) {
      if (question === from.question) setQuestion(to.question);
      if (message === from.thanks) setMessage(to.thanks);
      if (JSON.stringify(driversPositive) === JSON.stringify(from.positive)) setDriversPositive(to.positive);
      if (JSON.stringify(driversNegative) === JSON.stringify(from.negative)) setDriversNegative(to.negative);
    }
    setLanguage(next);
  }

  function clearCustom() {
    Object.values(pending).forEach((p) => URL.revokeObjectURL(p.url));
    setPending({});
    setLabels({});
    setIconError("");
  }

  async function pickIcon(value: number, file: File) {
    setIconError("");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkIconImage(bytes);
    if (!check.ok) return setIconError(`Rating ${value}: ${check.reason}`);
    if (file.type && file.type !== check.type.mime) return setIconError(`Rating ${value}: that file's name doesn't match what's inside it. Save it again as PNG, JPG or WebP.`);
    const url = URL.createObjectURL(new Blob([bytes], { type: check.type.mime }));
    setPending((prev) => {
      if (prev[String(value)]) URL.revokeObjectURL(prev[String(value)]!.url);
      return { ...prev, [String(value)]: { bytes, mime: check.type.mime, url } };
    });
    setDirty(true);
  }

  function dropIcon(value: number) {
    setPending((prev) => {
      const next = { ...prev };
      if (next[String(value)]) URL.revokeObjectURL(next[String(value)]!.url);
      delete next[String(value)];
      return next;
    });
    setDirty(true);
  }

  const customCount = Object.keys(pending).length + Object.values(labels).filter((v) => v.trim()).length;
  const previewOptions = creating
    ? resolveOptions(iconSet, { images: Object.fromEntries(Object.entries(pending).map(([k, v]) => [k, v.url])), labels: Object.fromEntries(Object.entries(labels).filter(([, v]) => v.trim())) }, language)
    : resolveOptions(iconSet, iconSet === initial?.iconSet ? { images: initial.iconImages, labels: initial.optionLabels } : undefined, language);

  // One-line summaries for folded parts.
  const emailCount = alertEmails.split(/[\s,;]+/).filter(Boolean).length;
  const thresholdLabel = set.options.find((o) => String(o.value) === threshold)?.label;
  const thanksSummary = [
    allowComment ? "Comment box on" : "No comment box",
    driversPositive.length + driversNegative.length > 0 ? plural(driversPositive.length + driversNegative.length, "reason") : "No reasons",
    reviewOn ? "Review button on" : "No review button",
  ].join(" · ");
  const unhappySummary = [
    thresholdLabel ? `Email alert at “${thresholdLabel}” or lower${emailCount ? ` to ${plural(emailCount, "address", "addresses")}` : " (add an email to turn on)"}` : "No email alerts",
    followupsEnabled ? `follow-up within ${DUE_OPTIONS.find((d) => d.value === dueHours)?.label ?? `${dueHours} hours`}${recoveryEmail ? ", then ask again" : ""}` : "no follow-ups",
  ].join(" · ");

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const emails = alertEmails
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
      status: String(f.get("status") ?? initial?.status ?? "active"),
      driversPositive,
      driversNegative,
      reviewCtaLabel: reviewOn ? String(f.get("reviewCtaLabel") ?? "") : null,
      reviewCtaUrl: reviewOn ? String(f.get("reviewCtaUrl") ?? "").trim() : null,
      followupsEnabled,
      followupDueHours: Number(dueHours),
      recoveryEmail,
      language,
      reasonsQuestionPositive: reasonsQPos,
      reasonsQuestionNegative: reasonsQNeg,
      ...(creating && canCustomizeIcons(iconSet) ? { optionLabels: Object.fromEntries(Object.entries(labels).filter(([, v]) => v.trim())) } : {}),
    };

    // Same schemas as the server: instant feedback here, the real check happens in the API.
    const schema = initial ? surveyUpdateSchema : surveyCreateSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) return showErrors(fieldErrors(parsed.error));
    setErrors({});
    setNotice(null);
    setBusy(true);
    const icons: PendingIcon[] =
      creating && canCustomizeIcons(iconSet) ? Object.entries(pending).map(([k, v]) => ({ value: Number(k), bytes: v.bytes, mime: v.mime })) : [];
    const res = await onSubmit(parsed.data as Record<string, unknown>, { icons });
    setBusy(false);
    if (res.ok) {
      setDirty(false);
      if (!creating) setNotice({ kind: "success", text: "Changes saved." });
    } else if (res.fields && Object.keys(res.fields).length) showErrors(res.fields, res.message);
    else {
      setNotice({ kind: "error", text: res.message ?? "Couldn't save. Please try again." });
      requestAnimationFrame(() => noticeRef.current?.focus());
    }
  }

  /** Mark the fields, open the parts they're in, and move focus to the first one. */
  function showErrors(errs: Record<string, string>, message?: string) {
    setErrors(errs);
    const parts = new Set(Object.keys(errs).map(partOf));
    setOpen((o) => ({ thanks: o.thanks || parts.has("thanks"), unhappy: o.unhappy || parts.has("unhappy") }));
    if (Object.keys(errs).some((k) => k.startsWith("optionLabels"))) setShowCustom(true);
    const n = Object.keys(errs).length;
    setNotice({ kind: "error", text: message ?? `${n === 1 ? "One field needs" : `${n} fields need`} attention. ${n === 1 ? "It's" : "They're"} marked below.` });
    // Wait for the parts to open, then go to the first problem.
    requestAnimationFrame(() => {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (first) {
        first.focus();
        first.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      } else noticeRef.current?.focus();
    });
  }

  const previewBody = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">What customers see</p>
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
          <EmailButtonsPreview iconSet={iconSet} question={question} options={previewOptions} lang={language} />
        </EmailFrame>
      ) : (
        <ThanksPreview
          question={question}
          message={message}
          brandColor={brandColor}
          allowComment={allowComment}
          drivers={driversPositive}
          reviewLabel={reviewOn ? "Review us" : null}
          lang={language}
          reasonsQuestion={reasonsQPos}
          ratingLabel={previewOptions.at(-1)?.label}
        />
      )}
      <p className="mt-3 text-[13px] text-muted">
        {previewOptions.some((o) => o.imageUrl)
          ? "Each button shows its label too, so it still works when an email app blocks pictures."
          : "Buttons are plain text and colour, so they show even when images are blocked."}
      </p>
    </>
  );

  let step = 0;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form ref={formRef} onSubmit={handle} onChange={changed} noValidate className="panel p-5 sm:p-7">
        <div ref={noticeRef} tabIndex={-1} className="outline-none" aria-live="polite">
          {notice && (
            <div className="mb-6">
              <Notice kind={notice.kind}>{notice.text}</Notice>
            </div>
          )}
        </div>
        {!canEdit && (
          <div className="mb-6">
            <Notice kind="info">You have view-only access. Ask the account owner to make changes.</Notice>
          </div>
        )}

        <fieldset disabled={!canEdit || busy} className="space-y-6">
          <FormPart id="basics" step={++step} title="Name and question" onFocusCapture={() => setPreview("email")}>
            <Field label="Survey name" name="name" error={errors.name} hint="Only your team sees this, for example “Support tickets”.">
              <TextInput name="name" defaultValue={initial?.name} maxLength={80} required autoFocus={creating} autoComplete="off" error={errors.name} hasHint />
            </Field>
            <Field label="Question customers see" name="question" error={errors.question} hint={`Short and specific works best. ${question.length}/200`}>
              <TextInput name="question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} required autoComplete="off" error={errors.question} hasHint />
            </Field>
            {(langAvailable || language !== "en") && (
              <Field
                label="Language customers see"
                name="language"
                error={errors.language}
                hint="Rating labels, the thank-you page, kiosk and survey emails use this language. Write your question and thank-you message in it too."
              >
                <select id="language" className="input sm:max-w-xs" value={language} onChange={(e) => changeLanguage(e.target.value as Lang)} aria-describedby="language-hint">
                  {LANGS.filter((l) => l === "en" || langAvailable || l === language).map((l) => (
                    <option key={l} value={l}>
                      {LANG_NAME[l]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </FormPart>

          <FormPart
            id="scale"
            step={++step}
            title="Rating buttons"
            description={hasResponses ? "The scale is locked because this survey already has ratings." : "Pick how customers answer. You can use your own pictures too."}
            onFocusCapture={() => setPreview("email")}
          >
            <fieldset>
              <legend className="sr-only">Rating scale</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ICON_SET_IDS.map((id) => {
                  const locked = Boolean(hasResponses && id !== initial?.iconSet);
                  const active = iconSet === id;
                  return (
                    <label
                      key={id}
                      className={`flex gap-3 rounded-[12px] border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                        active ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong"
                      } ${locked ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
                    >
                      <input
                        type="radio"
                        name="iconSetRadio"
                        value={id}
                        checked={active}
                        disabled={locked}
                        onChange={() => {
                          setIconSet(id);
                          if (creating) clearCustom();
                          // Keep the alert level valid for the new scale.
                          setThreshold((t) => (t === "" ? "" : String(ICON_SETS[id].negativeTo)));
                        }}
                        className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
                      />
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
            </fieldset>
            {errors.iconSet && <p className="text-[13px] font-medium text-neg-text">{errors.iconSet}</p>}

            {creating && canCustomizeIcons(iconSet) && (
              <div className="rounded-[12px] border border-line">
                <button
                  type="button"
                  onClick={() => setShowCustom((s) => !s)}
                  aria-expanded={showCustom}
                  aria-controls="custom-pictures"
                  className="flex min-h-12 w-full items-center gap-3 rounded-[12px] px-4 py-3 text-left hover:bg-canvas"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      Use your own pictures and words <span className="font-normal text-muted">(optional)</span>
                    </span>
                    <span className="block text-[13px] text-muted">
                      {customCount ? `${plural(customCount, "change")} so far` : "A mascot, your product or your logo, with your own words under each button."}
                    </span>
                  </span>
                  <Chevron open={showCustom} />
                </button>
                <div id="custom-pictures" hidden={!showCustom} className="space-y-3 border-t border-line p-4">
                  {iconError && (
                    <div role="alert">
                      <Notice kind="error">{iconError}</Notice>
                    </div>
                  )}
                  <ul className="space-y-3">
                    {set.options.map((o) => {
                      const key = String(o.value);
                      const pic = pending[key];
                      const err = errors[`optionLabels.${key}`];
                      return (
                        <li key={key} className="flex flex-wrap items-end gap-3">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-2 bg-white" style={{ borderColor: o.color }}>
                            {pic ? <img src={pic.url} alt={`Your picture for rating ${o.value}`} className="h-9 w-9 object-contain" /> : <span className="text-2xl" aria-hidden>{set.id === "stars5" ? `${o.value}★` : o.symbol}</span>}
                          </span>
                          <div className="min-w-[9rem] flex-1">
                            <label htmlFor={`new-label-${key}`} className="mb-1 block text-[13px] font-semibold">
                              Rating {o.value} label <span className="font-normal text-muted">(standard: {standardLabel(iconSet, o.value, language)})</span>
                            </label>
                            <input
                              id={`new-label-${key}`}
                              className="input"
                              value={labels[key] ?? ""}
                              placeholder={standardLabel(iconSet, o.value, language)}
                              maxLength={24}
                              autoComplete="off"
                              onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
                              aria-invalid={err ? "true" : undefined}
                              aria-describedby={err ? `new-label-${key}-error` : undefined}
                            />
                            {err && (
                              <p id={`new-label-${key}-error`} className="mt-1 text-[13px] font-medium text-neg-text">
                                {err}
                              </p>
                            )}
                          </div>
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
                              e.stopPropagation();
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) pickIcon(o.value, file);
                            }}
                          />
                          <div className="flex gap-2">
                            <button type="button" className="btn btn-secondary btn-sm min-h-11" onClick={() => fileInputs.current[key]?.click()} aria-label={`${pic ? "Change" : "Add"} picture for rating ${o.value}`}>
                              {pic ? "Change picture" : "Add picture"}
                            </button>
                            {pic && (
                              <button type="button" className="btn btn-ghost btn-sm min-h-11" onClick={() => dropIcon(o.value)} aria-label={`Remove picture for rating ${o.value}`}>
                                Remove
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-[13px] text-muted">PNG, JPG or WebP, square, up to 200 KB (256×256 works well). Still images only. You can change these later in the survey&rsquo;s Settings.</p>
                </div>
              </div>
            )}
          </FormPart>

          <FormPart
            id="thanks"
            step={++step}
            title="Thank-you page"
            description="What customers see after they tap a button."
            summary={thanksSummary}
            open={open.thanks}
            onToggle={() => setOpen((o) => ({ ...o, thanks: !o.thanks }))}
            onFocusCapture={() => setPreview("thanks")}
          >
            <div className="space-y-1.5">
              <label htmlFor="thankYouMessage" className="block text-sm font-semibold text-ink">
                Thank-you message
              </label>
              <textarea
                id="thankYouMessage"
                name="thankYouMessage"
                rows={2}
                className="input min-h-[4.5rem] resize-y py-2.5"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={300}
                aria-invalid={errors.thankYouMessage ? "true" : undefined}
                aria-describedby={errors.thankYouMessage ? "thankYouMessage-error" : "thankYouMessage-hint"}
              />
              {errors.thankYouMessage ? (
                <p id="thankYouMessage-error" className="text-[13px] font-medium text-neg-text">
                  {errors.thankYouMessage}
                </p>
              ) : (
                <p id="thankYouMessage-hint" className="text-[13px] text-muted">
                  {message.length}/300
                </p>
              )}
            </div>

            <Toggle checked={allowComment} onChange={setAllowComment} label="Ask for a comment" hint="An optional text box after the rating. Comments feed your AI insights." />

            <div className="space-y-4 rounded-[12px] bg-canvas p-4">
              <div>
                <p className="text-sm font-semibold">Quick reasons</p>
                <p className="text-[13px] text-muted">One-tap buttons that show why. Leave a list empty to skip it.</p>
              </div>
              <div className="space-y-3 rounded-[10px] border border-line bg-surface p-3">
                <Field label="Question after a good rating" name="reasonsQuestionPositive" optional error={errors.reasonsQuestionPositive}>
                  <TextInput name="reasonsQuestionPositive" value={reasonsQPos} onChange={(e) => setReasonsQPos(e.target.value)} placeholder={pt(language, "wentWell")} maxLength={80} autoComplete="off" error={errors.reasonsQuestionPositive} />
                </Field>
                <ChipListInput
                  label="Reasons to choose from"
                  name="driversPositive"
                  values={driversPositive}
                  onChange={(v) => {
                    setDriversPositive(v);
                    changed();
                  }}
                  error={errors.driversPositive}
                />
              </div>
              <div className="space-y-3 rounded-[10px] border border-line bg-surface p-3">
                <Field label="Question after a bad rating" name="reasonsQuestionNegative" optional error={errors.reasonsQuestionNegative}>
                  <TextInput name="reasonsQuestionNegative" value={reasonsQNeg} onChange={(e) => setReasonsQNeg(e.target.value)} placeholder={pt(language, "doBetter")} maxLength={80} autoComplete="off" error={errors.reasonsQuestionNegative} />
                </Field>
                <ChipListInput
                  label="Reasons to choose from"
                  name="driversNegative"
                  values={driversNegative}
                  onChange={(v) => {
                    setDriversNegative(v);
                    changed();
                  }}
                  error={errors.driversNegative}
                />
              </div>
            </div>

            <Toggle checked={reviewOn} onChange={setReviewOn} label="Ask happy customers for a review" hint="Shows a button only after a good rating." />
            {reviewOn && (
              <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:pl-8">
                <Field label="Button text" name="reviewCtaLabel" error={errors.reviewCtaLabel}>
                  <TextInput name="reviewCtaLabel" defaultValue={initial?.reviewCtaLabel ?? "Review us on Google"} maxLength={40} error={errors.reviewCtaLabel} />
                </Field>
                <Field label="Review page link" name="reviewCtaUrl" error={errors.reviewCtaUrl} hint="Your Google, Facebook or Tripadvisor review page, starting with https://">
                  <TextInput name="reviewCtaUrl" type="url" inputMode="url" placeholder="https://g.page/r/…/review" defaultValue={initial?.reviewCtaUrl ?? ""} maxLength={300} error={errors.reviewCtaUrl} hasHint />
                </Field>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <Field label="Brand colour" name="brandColor" error={errors.brandColor}>
                <div className="flex items-center gap-2">
                  <input
                    id="brandColor"
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-[10px] border border-control bg-white p-1"
                    aria-invalid={errors.brandColor ? "true" : undefined}
                    aria-describedby={errors.brandColor ? "brandColor-error" : undefined}
                  />
                  <span className="tabular text-sm text-muted">{brandColor}</span>
                </div>
              </Field>
              <Field label="Link back to your website" name="websiteUrl" optional error={errors.websiteUrl} hint="Starts with https://">
                <TextInput name="websiteUrl" type="url" inputMode="url" placeholder="https://yourbusiness.lk" defaultValue={initial?.websiteUrl ?? ""} maxLength={300} error={errors.websiteUrl} hasHint />
              </Field>
            </div>
          </FormPart>

          <FormPart
            id="unhappy"
            step={++step}
            title="When a customer is unhappy"
            description="Hear about it quickly and make sure someone follows up."
            summary={unhappySummary}
            open={open.unhappy}
            onToggle={() => setOpen((o) => ({ ...o, unhappy: !o.unhappy }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email an alert when the rating is" name="alertThreshold" error={errors.alertThreshold}>
                <select
                  id="alertThreshold"
                  name="alertThreshold"
                  className="input"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  aria-invalid={errors.alertThreshold ? "true" : undefined}
                >
                  <option value="">Don&rsquo;t send alerts</option>
                  {set.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label} or lower
                    </option>
                  ))}
                </select>
              </Field>
              {threshold !== "" && (
                <Field label="Send alerts to" name="alertEmails" error={errors.alertEmails ?? errors["alertEmails.0"]} hint={emailCount ? "Up to 10, separated by commas." : "Add at least one email, or no alerts are sent. Up to 10, separated by commas."}>
                  <TextInput
                    name="alertEmails"
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="you@business.lk"
                    value={alertEmails}
                    onChange={(e) => setAlertEmails(e.target.value)}
                    maxLength={2600}
                    error={errors.alertEmails ?? errors["alertEmails.0"]}
                    hasHint
                  />
                </Field>
              )}
            </div>

            <Toggle checked={followupsEnabled} onChange={setFollowupsEnabled} label="Create a follow-up task" hint="Every bad rating becomes a task with an owner and a due date, so no one is forgotten." />
            {followupsEnabled && (
              <div className="sm:pl-8">
                <Field label="Follow up within" name="followupDueHours" error={errors.followupDueHours}>
                  <select id="followupDueHours" className="input sm:max-w-xs" value={dueHours} onChange={(e) => setDueHours(e.target.value)} aria-invalid={errors.followupDueHours ? "true" : undefined}>
                    {DUE_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="mt-4">
                  <Toggle
                    checked={recoveryEmail}
                    onChange={setRecoveryEmail}
                    label="Ask “Did we put it right?” after resolving"
                    hint="When you mark a follow-up resolved, the customer gets one email asking how they feel now. You'll see how many unhappy customers you won back."
                  />
                </div>
              </div>
            )}
          </FormPart>

          {!creating && (
            <FormPart id="status" step={++step} title="Status">
              <Field label="Survey status" name="status" error={errors.status}>
                <select id="status" name="status" className="input sm:max-w-sm" defaultValue={initial?.status ?? "active"}>
                  <option value="active">Active: collecting ratings</option>
                  <option value="paused">Paused: buttons show &ldquo;survey closed&rdquo;</option>
                </select>
              </Field>
            </FormPart>
          )}
        </fieldset>

        {canEdit && (
          // Always within reach: sticks to the bottom of the screen (above the mobile tab bar) while you scroll.
          <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-5 -mb-5 mt-6 flex flex-wrap items-center gap-3 rounded-b-[var(--radius-panel)] border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-7 sm:-mb-7 sm:px-7 lg:bottom-0">
            <button className="btn btn-primary min-h-11" disabled={busy}>
              {busy ? (creating ? "Creating…" : "Saving…") : submitLabel}
            </button>
            <button
              type="button"
              className="btn btn-secondary min-h-11 lg:hidden"
              aria-haspopup="dialog"
              onClick={() => previewDialog.current?.showModal()}
            >
              <IconEye className="h-4 w-4" />
              Preview
            </button>
            <span className="text-[13px] text-muted" aria-live="polite">
              {busy ? "" : dirty ? "Unsaved changes" : creating ? "Only a name is needed. Everything else has a sensible default." : "All changes saved"}
            </span>
          </div>
        )}
      </form>

      <aside className="hidden lg:sticky lg:top-8 lg:block lg:self-start" aria-label="Preview">
        {previewBody}
      </aside>

      {/* Phones and tablets: the preview opens on top instead of sitting below a long form. */}
      <dialog
        ref={previewDialog}
        aria-label="Preview"
        onClick={(e) => {
          if (e.target === previewDialog.current) previewDialog.current?.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <div className="p-4">
          {previewBody}
          <button type="button" className="btn btn-secondary mt-4 min-h-11 w-full" onClick={() => previewDialog.current?.close()}>
            Close preview
          </button>
        </div>
      </dialog>
    </div>
  );
}
