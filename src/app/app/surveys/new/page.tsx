"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { SurveyForm } from "@/components/SurveyForm";
import { IconArrowLeft } from "@/components/icons";

export default function NewSurveyPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <header>
        <Link href="/app/surveys" className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <IconArrowLeft className="h-4 w-4" />
          Surveys
        </Link>
        <h1 className="mt-1 text-[28px] font-bold leading-tight">New survey</h1>
        <p className="text-sm text-muted">Set the question, then you&rsquo;ll get buttons to paste into your emails.</p>
      </header>
      <SurveyForm
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
