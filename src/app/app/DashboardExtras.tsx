"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { industryOf } from "@/lib/industries";
import { useAllows } from "@/components/PlanContext";
import { ShareDialog, type ShareCardData } from "@/components/ShareDialog";
import { useOnResponsesChanged } from "@/components/Notifications";

type Bench = { industry: string | null; mine: number | null; average: number | null; enough: boolean };

/** "Your 92% vs 85% average for restaurants" (last 90 days). Only an average of others is ever shown. */
export function BenchmarkCard({ canSetIndustry }: { canSetIndustry: boolean }) {
  const [b, setB] = useState<Bench | null>(null);
  const load = () => {
    api<Bench>("/api/account/industry").then((r) => r.ok && setB(r.data));
  };
  useEffect(load, []);
  useOnResponsesChanged(load);
  if (!b) return null;
  const ind = industryOf(b.industry);

  let body: React.ReactNode;
  if (!ind) {
    body = (
      <p className="text-sm text-muted">
        See how you compare with similar businesses.{" "}
        {canSetIndustry ? (
          <Link href="/app/settings/business" className="font-semibold text-brand hover:underline">
            Choose your industry
          </Link>
        ) : (
          "Ask the owner to choose your industry in Settings."
        )}
      </p>
    );
  } else if (b.mine === null) {
    body = <p className="text-sm text-muted">Once you have ratings, we&rsquo;ll compare you with other {ind.plural}.</p>;
  } else if (!b.enough || b.average === null) {
    body = (
      <p className="text-sm text-muted">
        You: <strong className="text-ink">{b.mine}% happy</strong>. We&rsquo;ll show the average for {ind.plural} once enough of them use TapTruly.
      </p>
    );
  } else {
    const diff = b.mine - b.average;
    body = (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p>
          <span className="font-display text-[34px] font-bold leading-none tabular">{b.mine}%</span>
          <span className="ml-1.5 text-sm text-muted">you</span>
        </p>
        <p>
          <span className="font-display text-[34px] font-bold leading-none tabular text-muted">{b.average}%</span>
          <span className="ml-1.5 text-sm text-muted">average for {ind.plural}</span>
        </p>
        <p className={`text-sm font-semibold ${diff >= 0 ? "text-pos-text" : "text-neg-text"}`}>
          {diff > 0 ? `${diff} points above average 🎉` : diff === 0 ? "Right on the average" : `${-diff} points below average`}
        </p>
      </div>
    );
  }
  return (
    <section aria-labelledby="bench-title" className="panel p-5">
      <h2 id="bench-title" className="mb-2 text-sm font-semibold text-muted">
        Compared with similar businesses <span className="font-normal">· last 90 days</span>
      </h2>
      {body}
    </section>
  );
}

/** Share a picture of this or last month: ratings, % happy and a kind comment. */
export function HighlightsButton() {
  const allowed = useAllows("social");
  const [month, setMonth] = useState<"current" | "previous" | null>(null);
  if (!allowed) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonth("current")}>
          ✨ Share this month
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth("previous")}>
          Last month
        </button>
      </div>
      <ShareDialog
        open={month !== null}
        onClose={() => setMonth(null)}
        title={month === "previous" ? "Share last month's highlights" : "Share this month's highlights"}
        subtitle="Your ratings and % of happy customers. A comment is included only if the customer agreed to social media sharing."
        fileName="our-month.png"
        loadingLabel="Making your highlights"
        load={() => api<ShareCardData>("/api/highlights", { method: "POST", body: { month: month ?? "current" } })}
      />
    </>
  );
}
