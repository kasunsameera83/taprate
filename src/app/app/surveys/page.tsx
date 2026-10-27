"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Survey } from "@/lib/client/types";
import { ICON_SETS } from "@/lib/surveys/iconSets";
import { Badge, EmptyState, LoadError, Skeleton } from "@/components/ui";
import { IconPlus, IconSurveys } from "@/components/icons";

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api<Survey[]>("/api/surveys").then((r) => (r.ok ? setSurveys(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Surveys</h1>
          <p className="text-sm text-muted">Each survey is one question with its own buttons.</p>
        </div>
        <Link href="/app/surveys/new" className="btn btn-primary">
          <IconPlus className="h-4 w-4" />
          New survey
        </Link>
      </header>

      {error && <LoadError message={error} onRetry={load} />}

      <div className="panel overflow-hidden">
        {surveys === null && !error ? (
          <div className="divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 p-5">
                <Skeleton className="h-10 w-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
              </div>
            ))}
          </div>
        ) : surveys && surveys.length === 0 ? (
          <EmptyState
            icon={<IconSurveys className="h-8 w-8" />}
            title="No surveys yet"
            body="Create a survey, then copy its buttons into your email signature or helpdesk replies."
            action={
              <Link href="/app/surveys/new" className="btn btn-primary">
                <IconPlus className="h-4 w-4" />
                Create your first survey
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {surveys?.map((s) => {
              const set = ICON_SETS[s.iconSet];
              return (
                <li key={s.id}>
                  <Link href={`/app/surveys/${s.id}`} className="flex items-center gap-4 p-4 hover:bg-canvas sm:p-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface text-xl" aria-hidden>
                      {s.iconSet === "nps" ? <span className="font-display text-sm font-bold">0–10</span> : s.iconSet === "stars5" ? "★" : set.options.at(-1)?.symbol}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{s.name}</span>
                        {s.status === "active" ? <Badge tone="pos">Active</Badge> : <Badge tone="plain">Paused</Badge>}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {s.question} <span className="text-faint">({set.name})</span>
                      </span>
                    </span>
                    <span className="hidden text-sm font-semibold text-brand sm:inline">Open</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
