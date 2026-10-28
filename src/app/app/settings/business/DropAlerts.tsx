"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Notice, Skeleton } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";

/** Email (and phone alert) to owners and admins when satisfaction drops sharply. Owner switches it. */
export function DropAlerts({ canChange }: { canChange: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ enabled: boolean }>("/api/account/drops").then((r) => r.ok && setEnabled(r.data.enabled));
  }, []);
  async function toggle(next: boolean) {
    setMsg("");
    const r = await api<{ enabled: boolean }>("/api/account/drops", { method: "PATCH", body: { enabled: next } });
    if (r.ok) setEnabled(r.data.enabled);
    else setMsg(r.message);
  }
  return (
    <SettingsSection title="Drop alerts" description="If satisfaction falls by 10 points or more in a week, for the whole business or any branch, owners and admins get an email. It needs at least 20 ratings a week, so a few unlucky ratings don't set it off.">
      {enabled === null ? (
        <Skeleton className="h-11 w-48" />
      ) : (
        <label className={`flex items-center gap-3 ${canChange ? "cursor-pointer" : ""}`}>
          <input type="checkbox" checked={enabled} disabled={!canChange} onChange={(e) => toggle(e.target.checked)} className="h-5 w-5 accent-[var(--color-brand)]" />
          <span className="text-sm font-semibold">{enabled ? "On" : "Off"}</span>
          {!canChange && <span className="text-[13px] text-muted">Only the owner can change this.</span>}
        </label>
      )}
      {msg && (
        <div className="mt-3">
          <Notice kind="error">{msg}</Notice>
        </div>
      )}
    </SettingsSection>
  );
}
