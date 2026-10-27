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
        onSubmit={async (values) => {
          const res = await api<Survey>("/api/surveys", { method: "POST", body: values });
          if (res.ok) {
            router.push(`/app/surveys/${res.data.id}?created=1`);
            return { ok: true };
          }
          return { ok: false, message: res.message, fields: res.fields };
        }}
      />
    </div>
  );
}
