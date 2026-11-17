"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { CHANNELS, SURVEY_TEMPLATES, WELCOME_SKIPPED_KEY, templateSurvey, templateWording, type Channel, type TemplateId } from "@/lib/surveys/templates";
import { ICON_SETS } from "@/lib/surveys/iconSets";
import { Notice } from "@/components/ui";
import { Busy } from "@/components/FaceLoader";
import type { Lang } from "@/lib/i18n/public";

// First-run setup for new businesses: three taps, then a ready survey. Creating it goes through the same
// POST /api/surveys as the full form, so the server checks it exactly the same way (role, plan, fields).

const LANGS: Array<{ id: Lang; label: string }> = [
  { id: "en", label: "English" },
  { id: "si", label: "Sinhala" },
  { id: "ta", label: "Tamil" },
];

function Choice({ checked, onSelect, emoji, title, hint, name, value }: { checked: boolean; onSelect: () => void; emoji: string; title: string; hint: string; name: string; value: string }) {
  return (
    <label
      className={`flex h-full cursor-pointer items-start gap-3 rounded-[14px] border-2 bg-surface p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
        checked ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="sr-only" />
      <span className="text-[28px] leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  // Sinhala and Tamil are only offered to Sri Lankan businesses (the database enforces this too).
  const [localLanguages, setLocalLanguages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ email: string | null; role: string | null; name: string | null; account: { localLanguages?: boolean } | null }>("/api/account").then((r) => {
      if (!r.ok) return;
      setLocalLanguages(Boolean(r.data.account?.localLanguages));
      setEmail(r.data.email);
      setRole(r.data.role);
      setBusinessName(r.data.name ?? "");
    });
  }, []);

  const template = SURVEY_TEMPLATES.find((t) => t.id === templateId) ?? null;
  const ready = channel !== null && template !== null;
  const canCreate = role === "owner" || role === "admin";

  async function create() {
    if (!template || !channel) return;
    setBusy(true);
    setError("");
    const r = await api<Survey>("/api/surveys", { method: "POST", body: templateSurvey(template, localLanguages ? lang : "en", email) });
    if (r.ok) {
      router.push(`/app/surveys/${encodeURIComponent(r.data.id)}?created=1&via=${channel}`);
      return;
    }
    setBusy(false);
    setError(r.message);
  }

  function skip() {
    try {
      localStorage.setItem(WELCOME_SKIPPED_KEY, "1");
    } catch {
      /* storage blocked: fine */
    }
  }

  if (role !== null && !canCreate) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <h1 className="text-[28px] font-bold">Welcome to TapTruly</h1>
        <p className="text-muted">The business owner or an admin sets up the surveys. Once they do, ratings appear on your dashboard.</p>
        <Link href="/app" className="btn btn-primary">
          Go to the dashboard
        </Link>
      </div>
    );
  }

  const preview = template ? templateWording(template, lang).question : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-sm font-semibold text-brand">Welcome{businessName ? `, ${businessName}` : ""} 👋</p>
        <h1 className="mt-1 text-[30px] font-bold leading-tight">Let&rsquo;s get your first rating in two minutes</h1>
        <p className="mt-2 text-muted">Answer two quick questions and we&rsquo;ll set everything up. You can change any of it later.</p>
      </header>

      <fieldset>
        <legend className="text-lg font-semibold">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">1</span>
          Where do you talk to customers most?
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map((c) => (
            <Choice key={c.id} name="channel" value={c.id} checked={channel === c.id} onSelect={() => setChannel(c.id)} emoji={c.emoji} title={c.title} hint={c.hint} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-semibold">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">2</span>
          When do you want to ask how it went?
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SURVEY_TEMPLATES.map((t) => (
            <Choice key={t.id} name="template" value={t.id} checked={templateId === t.id} onSelect={() => setTemplateId(t.id)} emoji={t.emoji} title={t.title} hint={t.hint} />
          ))}
        </div>
      </fieldset>

      {localLanguages && (
      <fieldset>
        <legend className="text-sm font-semibold text-muted">Language your customers see</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <label key={l.id} className={`cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${lang === l.id ? "border-brand bg-brand-soft text-brand" : "border-line text-ink"}`}>
              <input type="radio" name="lang" value={l.id} checked={lang === l.id} onChange={() => setLang(l.id)} className="sr-only" />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>
      )}

      {preview && (
        <section aria-label="Preview" className="rounded-[var(--radius-panel)] border border-line bg-canvas p-5 text-center">
          <p className="text-[13px] font-semibold text-muted">Your customers will see</p>
          <p className="mt-2 text-xl font-bold">{preview}</p>
          <p className="mt-3 flex justify-center gap-3 text-[32px] leading-none" aria-hidden>
            {ICON_SETS.faces5.options.map((o) => (
              <span key={o.value}>{o.symbol}</span>
            ))}
          </p>
          <p className="mt-3 text-[13px] text-muted">
            {email ? `Unhappy ratings are emailed to ${email}, and become a follow-up task.` : "Unhappy ratings become a follow-up task."}
          </p>
        </section>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary min-h-12 px-6 text-base" disabled={!ready || busy || !canCreate} onClick={create}>
          {busy ? <Busy>Setting up…</Busy> : "Create my survey"}
        </button>
        {!ready && <span className="text-sm text-muted">Pick an answer for 1 and 2.</span>}
        <Link href="/app/surveys/new" onClick={skip} className="ml-auto text-sm font-semibold text-muted hover:text-ink">
          Skip, I&rsquo;ll set it up myself
        </Link>
      </div>
    </div>
  );
}
