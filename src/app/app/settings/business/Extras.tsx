"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Notice } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { PaidFeatureNotice } from "@/components/PlanContext";
import { INDUSTRIES, type IndustryId } from "@/lib/industries";

/** The business's industry, used to compare its happy % with similar businesses on the dashboard. */
export function IndustrySetting({ canChange }: { canChange: boolean }) {
  const [value, setValue] = useState<IndustryId | "" | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    api<{ industry: IndustryId | null }>("/api/account/industry").then((r) => setValue(r.ok ? (r.data.industry ?? "") : ""));
  }, []);
  async function save(next: IndustryId | "") {
    setValue(next);
    setMsg(null);
    const r = await api("/api/account/industry", { method: "PATCH", body: { industry: next || null } });
    setMsg(r.ok ? { kind: "success", text: "Saved. Your dashboard now compares you with similar businesses." } : { kind: "error", text: r.message });
  }
  return (
    <SettingsSection title="Your industry" description="Used to compare your happy customers with similar businesses on your dashboard. Other businesses never see your numbers, only an average.">
      <div className="space-y-3">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <label className="block max-w-sm space-y-1 text-sm">
          <span className="font-semibold">Industry</span>
          <select className="input" value={value ?? ""} disabled={!canChange || value === null} onChange={(e) => save(e.target.value as IndustryId | "")}>
            <option value="">Choose…</option>
            {INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </SettingsSection>
  );
}

/** Hide "Feedback by TapTruly" (Growth and Scale). */
export function BrandingSetting({ canChange }: { canChange: boolean }) {
  const [s, setS] = useState<{ hidden: boolean; allowed: boolean } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ hidden: boolean; allowed: boolean }>("/api/account/branding").then((r) => r.ok && setS(r.data));
  }, []);
  if (!s) return null;
  return (
    <SettingsSection title="TapTruly branding" description="A small “Feedback by TapTruly” appears on your survey pages, website widget, reply emails and share cards.">
      <div className="space-y-3">
        {!s.allowed ? (
          <PaidFeatureNotice feature="white_label" />
        ) : (
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-brand)]"
              checked={s.hidden}
              disabled={!canChange}
              onChange={async (e) => {
                const next = e.target.checked;
                setErr("");
                const r = await api<{ hidden: boolean }>("/api/account/branding", { method: "PATCH", body: { enabled: next } });
                if (r.ok) setS({ ...s, hidden: r.data.hidden });
                else setErr(r.message);
              }}
            />
            Hide “Feedback by TapTruly”
          </label>
        )}
        {err && <Notice kind="error">{err}</Notice>}
      </div>
    </SettingsSection>
  );
}
