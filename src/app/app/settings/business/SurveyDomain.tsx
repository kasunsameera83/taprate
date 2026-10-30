"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { Badge, Field, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { PaidFeatureNotice } from "@/components/PlanContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Busy } from "@/components/FaceLoader";
import { normalizeSurveyDomain } from "@/lib/surveyDomainRules";

type Rec = { type: string; name: string; value: string };
type Info = { allowed: boolean; configured: boolean; domain: { domain: string; status: string; records: Rec[]; checked_at: string | null } | null };

// Survey pages (thank-you page, QR and WhatsApp links, kiosks, widget) on the business's own web address.
export function SurveyDomain({ canChange }: { canChange: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Info>("/api/survey-domain").then((r) => r.ok && setInfo(r.data));
  }, []);
  useEffect(load, [load]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = String(new FormData(e.currentTarget).get("domain") ?? "");
    const domain = normalizeSurveyDomain(raw);
    if (!domain) return setError("Use a subdomain you own, like feedback.yourbusiness.com");
    setError("");
    setBusy(true);
    const r = await api("/api/survey-domain", { method: "POST", body: { domain } });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "error", text: r.fields?.domain ?? r.message });
    setMsg({ kind: "info", text: "Added. Add the DNS record below where you manage your domain, then press “Check DNS”." });
    load();
  }

  async function check() {
    setBusy(true);
    setMsg(null);
    const r = await api<{ verified: boolean }>("/api/survey-domain/verify", { method: "POST" });
    setBusy(false);
    if (!r.ok) setMsg({ kind: "error", text: r.message });
    else if (r.data.verified) setMsg({ kind: "success", text: "Verified. New survey links, QR codes and emails now use your own web address." });
    else setMsg({ kind: "info", text: "Not ready yet. DNS changes can take up to a few hours; check again later." });
    load();
  }

  async function remove() {
    if (!(await confirmDialog({ title: "Stop using your web address?", body: "New links will use taptruly.com again. Links already printed with your address will stop working.", confirmLabel: "Remove", danger: true }))) return;
    await api("/api/survey-domain", { method: "DELETE" });
    load();
  }

  return (
    <SettingsSection title="Survey pages on your own web address" description="Customers see your address, like feedback.yourbusiness.com, on the thank-you page, QR codes, WhatsApp links, kiosks and your website widget.">
      {!info ? (
        <Skeleton className="h-20 w-full" />
      ) : !info.allowed && !info.domain ? (
        <PaidFeatureNotice feature="custom_domain" />
      ) : !info.configured ? (
        <Notice kind="info">This isn&rsquo;t switched on for the server yet (it needs the hosting settings). Contact support.</Notice>
      ) : info.domain ? (
        <div className="space-y-4">
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{info.domain.domain}</span>
            {info.domain.status === "verified" ? <Badge tone="pos">Live</Badge> : <Badge tone="neu">Waiting for DNS</Badge>}
          </div>
          {info.domain.status !== "verified" && (
            <>
              <p className="text-sm text-muted">Add this where you manage your domain&rsquo;s DNS (for example your registrar, Cloudflare or cPanel):</p>
              <div className="overflow-x-auto rounded-[10px] border border-line">
                <table className="w-full min-w-[30rem] text-left text-[13px]">
                  <thead className="bg-[#f8fafc] text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Type</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {info.domain.records.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-semibold">{r.type}</td>
                        <td className="px-3 py-2"><code className="break-all">{r.name}</code></td>
                        <td className="px-3 py-2"><code className="break-all">{r.value}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {info.domain.status !== "verified" && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={check}>
                {busy ? <Busy>Checking…</Busy> : "Check DNS"}
              </button>
            )}
            {canChange && (
              <button type="button" className="btn btn-ghost" onClick={remove}>
                Remove
              </button>
            )}
          </div>
        </div>
      ) : canChange ? (
        <form onSubmit={add} noValidate className="space-y-3">
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <Field label="Web address" name="domain" error={error} hint="Use a subdomain, like feedback.yourbusiness.com. Your main website isn't affected.">
            <TextInput name="domain" placeholder="feedback.yourbusiness.com" maxLength={253} autoComplete="off" spellCheck={false} error={error} hasHint />
          </Field>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <Busy>Adding…</Busy> : "Add address"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">Only the owner can set this up.</p>
      )}
    </SettingsSection>
  );
}
