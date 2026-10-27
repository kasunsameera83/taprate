"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { ICON_SETS } from "@/lib/surveys/iconSets";
import { FormMessage } from "@/components/ui";

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Survey[]>("/api/surveys").then((r) => (r.ok ? setSurveys(r.data) : setError(r.message)));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Surveys</h1>
        <Link href="/app/surveys/new" className="btn btn-primary">
          New survey
        </Link>
      </div>
      <FormMessage kind="error">{error}</FormMessage>
      {surveys && surveys.length === 0 && <p className="text-[var(--muted)]">No surveys yet.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {surveys?.map((s) => (
          <Link key={s.id} href={`/app/surveys/${s.id}`} className="panel block p-4 hover:border-[var(--ink)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{s.name}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "active" ? "bg-green-50 text-[var(--ok)]" : "bg-gray-100 text-[var(--muted)]"}`}>
                {s.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{s.question}</p>
            <p className="mt-3 text-lg">{ICON_SETS[s.iconSet].options.map((o) => o.symbol).join(" ")}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
