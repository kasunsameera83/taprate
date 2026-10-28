import Link from "next/link";
import type { Metadata } from "next";
import { requirePageSession } from "@/lib/session";
import { canPerform } from "@/lib/security/authz";
import { reportQuerySchema } from "@/lib/validation/schemas";
import { loadPeriod } from "@/lib/insights/data";
import { insightResultSchema } from "@/lib/insights/ai";
import { periodLabel } from "@/lib/insights/reportEmail";
import { PrintButton } from "@/app/app/settings/billing/receipts/[id]/PrintButton";

export const metadata: Metadata = { title: "Feedback report" };

// A report laid out for paper: use the browser's "Save as PDF". Read with the user's own session, so
// the database's rules apply (agents only ever see their own ratings).
export default async function PrintReport({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const parsed = reportQuerySchema.safeParse({ surveyId: typeof sp.surveyId === "string" ? sp.surveyId : undefined, days: typeof sp.days === "string" ? sp.days : undefined });
  const q = parsed.success ? parsed.data : { surveyId: undefined, days: 30 as const };
  const { supabase, active } = await requirePageSession({ needAccount: true });
  const acc = active!.accountId;
  const now = Date.now();

  const [{ data: account }, survey, period, insight] = await Promise.all([
    supabase.from("accounts").select("name").eq("id", acc).maybeSingle(),
    q.surveyId ? supabase.from("surveys").select("name").eq("id", q.surveyId).eq("account_id", acc).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    loadPeriod(supabase, acc, { surveyId: q.surveyId ?? null, days: q.days, now }),
    canPerform(active!.role, "insights:read")
      ? (() => {
          let iq = supabase.from("insights").select("result, created_at").eq("account_id", acc).eq("period_days", q.days);
          iq = q.surveyId ? iq.eq("survey_id", q.surveyId) : iq.is("survey_id", null);
          return iq.order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data);
        })()
      : Promise.resolve(null),
  ]);
  const s = period.stats;
  const ai = insight ? insightResultSchema.safeParse(insight.result) : null;
  const max = Math.max(1, ...s.byDay.map((d) => d.total));
  const negatives = period.comments.filter((c) => c.sentiment === "negative").slice(0, 8);
  const positives = period.comments.filter((c) => c.sentiment === "positive").slice(0, 5);
  const change = s.satisfactionPct !== null && s.previous.satisfactionPct !== null ? Math.round((s.satisfactionPct - s.previous.satisfactionPct) * 10) / 10 : null;

  const Tile = ({ label, value, note }: { label: string; value: string; note?: string }) => (
    <div className="rounded-[10px] border border-line p-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-2xl font-bold tabular">{value}</p>
      {note && <p className="text-[12px] text-muted">{note}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href="/app/insights" className="btn btn-ghost">
          Back
        </Link>
        <PrintButton />
        <p className="w-full text-[13px] text-muted">In the print window, choose &ldquo;Save as PDF&rdquo; as the printer.</p>
      </div>

      <article className="print-area panel space-y-6 p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-[13px] text-muted">TapRate feedback report</p>
            <h1 className="text-2xl font-bold">{account?.name}</h1>
            <p className="text-sm text-muted">
              {survey?.name ?? "All surveys"} · last {q.days} days ({periodLabel(q.days, now)})
            </p>
          </div>
          <p className="text-[12px] text-muted">Made {new Date(now).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</p>
        </header>

        {s.total === 0 ? (
          <p>No ratings in this period.</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Satisfied" value={s.satisfactionPct === null ? "–" : `${s.satisfactionPct}%`} note={change === null ? "no earlier data" : `${change > 0 ? "+" : ""}${change} pts vs before`} />
              <Tile label="Ratings" value={s.total.toLocaleString()} note={`${s.previous.total.toLocaleString()} the period before`} />
              <Tile label="Positive / neutral / negative" value={`${s.positive}/${s.neutral}/${s.negative}`} />
              <Tile label={s.nps ? "NPS" : s.ces ? "Effort (1–7)" : "Comments"} value={s.nps ? String(s.nps.score) : s.ces ? String(s.ces.average) : period.totalComments.toLocaleString()} />
            </section>

            <section>
              <h2 className="text-lg font-semibold">Ratings per day</h2>
              <div className="mt-3 flex h-28 items-end gap-[2px]" role="img" aria-label={`Ratings per day; ${s.total} in total`}>
                {s.byDay.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }} title={`${d.date}: ${d.total}`}>
                    {d.negative > 0 && <div className="bg-neg-fill" style={{ height: `${(d.negative / max) * 100}%` }} />}
                    {d.neutral > 0 && <div className="bg-neu-fill" style={{ height: `${(d.neutral / max) * 100}%` }} />}
                    {d.positive > 0 && <div className="bg-pos-fill" style={{ height: `${(d.positive / max) * 100}%` }} />}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[12px] text-muted">Green positive, amber neutral, red negative.</p>
            </section>

            {ai?.success && (
              <section className="break-inside-avoid">
                <h2 className="text-lg font-semibold">AI summary</h2>
                <p className="mt-1 font-semibold">{ai.data.headline}</p>
                <p className="mt-1 text-sm text-muted">{ai.data.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {ai.data.themes.map((t, i) => (
                    <li key={i}>
                      <strong>{t.title}</strong> ({t.sentiment}, {t.mentions}): {t.detail}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm font-semibold">Suggested actions</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {ai.data.actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </section>
            )}

            {(s.drivers.positive.length > 0 || s.drivers.negative.length > 0) && (
              <section className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h2 className="text-lg font-semibold">What went well</h2>
                  <ul className="mt-1 text-sm">
                    {s.drivers.positive.map((d) => (
                      <li key={d.label}>
                        {d.label} <span className="text-muted">({d.count})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="text-lg font-semibold">What could be better</h2>
                  <ul className="mt-1 text-sm">
                    {s.drivers.negative.map((d) => (
                      <li key={d.label}>
                        {d.label} <span className="text-muted">({d.count})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {s.byAgent.length > 0 && (
              <section className="break-inside-avoid">
                <h2 className="text-lg font-semibold">By agent</h2>
                <table className="mt-2 w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-1.5 font-semibold">Agent</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Ratings</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Satisfied</th>
                      <th scope="col" className="py-1.5 text-right font-semibold">Negative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byAgent.slice(0, 15).map((a) => (
                      <tr key={a.agent} className="border-b border-line">
                        <td className="py-1.5">{a.agent}</td>
                        <td className="py-1.5 text-right tabular">{a.total}</td>
                        <td className="py-1.5 text-right tabular">{a.satisfactionPct}%</td>
                        <td className="py-1.5 text-right tabular">{a.negative}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {negatives.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold">Recent unhappy comments</h2>
                {negatives.map((c, i) => (
                  <blockquote key={i} className="mt-2 break-inside-avoid border-l-2 border-neg-fill pl-3 text-sm">
                    <span className="block text-[12px] text-muted">
                      {c.rating}
                      {c.agent ? ` · ${c.agent}` : ""} · {new Date(c.createdAt).toLocaleDateString("en-GB")}
                    </span>
                    <span className="whitespace-pre-line">{c.text}</span>
                  </blockquote>
                ))}
              </section>
            )}
            {positives.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold">Recent happy comments</h2>
                {positives.map((c, i) => (
                  <blockquote key={i} className="mt-2 break-inside-avoid border-l-2 border-pos-fill pl-3 text-sm">
                    <span className="whitespace-pre-line">{c.text}</span>
                  </blockquote>
                ))}
              </section>
            )}
          </>
        )}
      </article>
    </div>
  );
}
