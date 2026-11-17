"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SURVEY_TEMPLATES, type TemplateId } from "@/lib/surveys/templates";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { SurveyForm } from "@/components/SurveyForm";
import { IconArrowLeft } from "@/components/icons";

export default function NewSurveyPage() {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<TemplateId | null>(null);
  const t = SURVEY_TEMPLATES.find((x) => x.id === templateId);
  return (
    <div className="space-y-6">
      <header>
        <Link href="/app/surveys" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft className="h-4 w-4" />
          Surveys
        </Link>
        <h1 className="mt-1 text-[28px] font-bold leading-tight">New survey</h1>
        <p className="text-sm text-muted">Start from a ready-made survey, or write your own question below.</p>
      </header>
      <section aria-labelledby="tpl-title">
        <h2 id="tpl-title" className="sr-only">
          Ready-made surveys
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SURVEY_TEMPLATES.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                aria-pressed={templateId === x.id}
                onClick={() => setTemplateId(templateId === x.id ? null : x.id)}
                className={`flex h-full w-full items-start gap-3 rounded-[12px] border bg-surface p-3 text-left hover:bg-canvas ${templateId === x.id ? "border-brand ring-1 ring-brand" : "border-line"}`}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {x.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{x.title}</span>
                  <span className="block text-[13px] text-muted">{x.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <SurveyForm
        key={templateId ?? "blank"}
        preset={t ? { name: t.name, question: t.question, driversPositive: t.positive, driversNegative: t.negative } : undefined}
        submitLabel="Create survey"
        onSubmit={async (values, { icons }) => {
          const res = await api<Survey>("/api/surveys", { method: "POST", body: values });
          if (res.ok) {
            // Upload any pictures chosen in the form now that the survey exists (the server checks each one again).
            let failed = 0;
            for (const icon of icons) {
              try {
                const up = await fetch(`/api/surveys/${encodeURIComponent(res.data.id)}/icons/${icon.value}`, {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": icon.mime },
                  body: new Blob([icon.bytes as Uint8Array<ArrayBuffer>], { type: icon.mime }),
                });
                if (!up.ok) failed++;
              } catch {
                failed++;
              }
            }
            router.push(`/app/surveys/${res.data.id}?created=1${failed ? `&iconsFailed=${failed}&tab=settings` : ""}`);
            return { ok: true };
          }
          return { ok: false, message: res.message, fields: res.fields };
        }}
      />
    </div>
  );
}
