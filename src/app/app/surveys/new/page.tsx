"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { SurveyForm } from "@/components/SurveyForm";

export default function NewSurveyPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New survey</h1>
      <SurveyForm
        submitLabel="Create survey"
        onSubmit={async (values) => {
          const res = await api<Survey>("/api/surveys", { method: "POST", body: values });
          if (res.ok) {
            router.push(`/app/surveys/${res.data.id}`);
            return { ok: true };
          }
          return { ok: false, message: res.message, fields: res.fields };
        }}
      />
    </div>
  );
}
