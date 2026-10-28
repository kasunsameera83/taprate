"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { IconCheck } from "@/components/icons";

type Onboarding = { firstSurveyId: string | null; steps: Record<"survey" | "tried" | "rating" | "logo" | "team" | "alerts", boolean> };

// First-run checklist on the dashboard. Hides itself when everything's done, or when dismissed
// (remembered in this browser only).
export function Checklist({ accountId }: { accountId: string | null }) {
  const [data, setData] = useState<Onboarding | null>(null);
  const [hidden, setHidden] = useState(true);
  const key = `tr:checklist-dismissed:${accountId ?? "x"}`;

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) === "1";
    } catch {
      /* storage blocked: just show it */
    }
    setHidden(dismissed);
    if (!dismissed) api<Onboarding>("/api/onboarding").then((r) => r.ok && setData(r.data));
  }, [key]);

  if (hidden || !data) return null;
  const s = data.steps;
  const survey = data.firstSurveyId ? `/app/surveys/${data.firstSurveyId}` : "/app/surveys/new";
  const items = [
    { done: s.survey, title: "Create your first survey", body: "Pick a question and a rating scale.", href: "/app/surveys/new", cta: "Create survey" },
    { done: s.tried, title: "Send it to yourself", body: "Use “Send a test to me” and tap a button, so you see what customers see.", href: `${survey}?tab=send`, cta: "Send a test" },
    { done: s.rating, title: "Get your first rating", body: "Add the buttons to your emails, print a QR code, or send to a few customers.", href: survey, cta: "Share it" },
    { done: s.logo, title: "Add your logo", body: "It shows on your thank-you pages and survey emails.", href: "/app/settings/business", cta: "Add logo" },
    { done: s.team, title: "Invite your team", body: "Agents see their own ratings; admins can follow up.", href: "/app/settings/team", cta: "Invite" },
    { done: s.alerts, title: "Turn on phone alerts", body: "Hear about unhappy customers the moment they tap.", href: "/app/settings", cta: "Turn on" },
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;
  const next = items.find((i) => !i.done);

  return (
    <section aria-labelledby="checklist-title" className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="checklist-title" className="text-lg font-semibold">
            Get set up
          </h2>
          <p className="text-sm text-muted">
            {doneCount} of {items.length} done
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            try {
              localStorage.setItem(key, "1");
            } catch {
              /* ignore */
            }
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6e8ee]" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={doneCount}>
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.title} className={`flex gap-3 rounded-[12px] border p-3 ${i === next ? "border-brand bg-brand-soft" : "border-line"}`}>
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i.done ? "bg-pos-fill text-white" : "border-2 border-line-strong"}`} aria-hidden>
              {i.done && <IconCheck className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${i.done ? "text-muted line-through" : ""}`}>
                {i.title}
                <span className="sr-only">{i.done ? " (done)" : ""}</span>
              </span>
              {!i.done && (
                <>
                  <span className="block text-[13px] text-muted">{i.body}</span>
                  <Link href={i.href} className="mt-1 inline-block text-[13px] font-semibold text-brand hover:underline">
                    {i.cta}
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
