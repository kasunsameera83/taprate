"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { sendingDomainSchema, type DnsRecord } from "@/lib/sending/domainRules";
import { fieldErrors } from "@/lib/validation/schemas";
import { Badge, Field, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";

type Info = { allowed: boolean; domain: { domain: string; from_local: string; status: string; records: DnsRecord[]; checked_at: string | null; verified_at: string | null } | null };

const STATUS: Record<string, { label: string; tone: "pos" | "neu" | "neg" | "plain" }> = {
  verified: { label: "Verified: emails go out from your domain", tone: "pos" },
  pending: { label: "Checking DNS", tone: "neu" },
  not_started: { label: "Waiting for DNS records", tone: "plain" },
  failed: { label: "DNS check failed", tone: "neg" },
  temporary_failure: { label: "Couldn't check right now", tone: "neu" },
};

function CopyCell({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ml-2 shrink-0 text-[12px] font-semibold text-brand hover:underline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* visible to copy by hand */
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

// Survey emails from feedback@your-domain instead of TapTruly's address (Scale plan).
export function OwnDomain({ canChange }: { canChange: boolean }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Info>("/api/sending-domain").then((r) => r.ok && setInfo(r.data));
  }, []);
  useEffect(load, [load]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p = sendingDomainSchema.safeParse({ domain: String(f.get("domain") ?? ""), fromLocal: String(f.get("fromLocal") ?? "") || "feedback" });
    if (!p.success) return setErrors(fieldErrors(p.error));
    setErrors({});
    setBusy(true);
    const r = await api("/api/sending-domain", { method: "POST", body: p.data });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "error", text: r.message });
    setMsg({ kind: "info", text: "Domain added. Add the DNS records below at your domain provider, then press “Check DNS”." });
    load();
  }

  async function check() {
    setBusy(true);
    setMsg(null);
    const r = await api<{ status: string }>("/api/sending-domain/verify", { method: "POST" });
    setBusy(false);
    if (!r.ok) setMsg({ kind: "error", text: r.message });
    else if (r.data.status === "verified") setMsg({ kind: "success", text: "Verified. Your survey emails now come from your own domain." });
    else setMsg({ kind: "info", text: "Not verified yet. DNS changes can take up to a few hours to show up; check again later." });
    load();
  }

  async function remove() {
    if (!(await confirmDialog({ title: "Stop using your domain?", body: "Survey emails will go out from TapTruly's address again.", confirmLabel: "Remove domain", danger: true }))) return;
    await api("/api/sending-domain", { method: "DELETE" });
    load();
  }

  return (
    <SettingsSection title="Send from your own domain" description="Survey emails come from an address like feedback@mail.yourbusiness.lk instead of TapTruly's. Customers trust it more, and more emails reach the inbox.">
      {!info ? (
        <Skeleton className="h-20 w-full" />
      ) : !info.allowed && !info.domain ? (
        <p className="text-sm text-muted">
          Part of the Scale plan.{" "}
          <Link href="/app/settings/billing" className="font-semibold text-brand hover:underline">
            See plans
          </Link>
        </p>
      ) : info.domain ? (
        <div className="space-y-4">
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {info.domain.from_local}@{info.domain.domain}
            </span>
            <Badge tone={STATUS[info.domain.status]?.tone ?? "plain"}>{STATUS[info.domain.status]?.label ?? info.domain.status}</Badge>
          </div>
          {info.domain.status !== "verified" && (
            <>
              <p className="text-sm text-muted">Add these records where you manage your domain&rsquo;s DNS (for example your registrar, Cloudflare or cPanel):</p>
              <div className="overflow-x-auto rounded-[10px] border border-line">
                <table className="w-full min-w-[34rem] text-left text-[13px]">
                  <thead className="bg-[#f8fafc] text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Type</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Value</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {info.domain.records.map((r, i) => (
                      <tr key={i} className="align-top">
                        <td className="px-3 py-2 font-semibold">
                          {r.type}
                          {r.priority !== null && <span className="block text-[11px] font-normal text-muted">priority {r.priority}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex items-start">
                            <code className="break-all">{r.name}</code>
                            <CopyCell text={r.name} />
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex items-start">
                            <code className="max-w-[22rem] break-all">{r.value}</code>
                            <CopyCell text={r.value} />
                          </span>
                        </td>
                        <td className="px-3 py-2">{r.status === "verified" ? <Badge tone="pos">OK</Badge> : <span className="text-muted">Waiting</span>}</td>
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
                {busy ? "Checking…" : "Check DNS"}
              </button>
            )}
            {canChange && (
              <button type="button" className="btn btn-ghost" onClick={remove}>
                Remove domain
              </button>
            )}
          </div>
        </div>
      ) : canChange ? (
        <form onSubmit={add} noValidate className="space-y-3">
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Field label="Domain" name="domain" error={errors.domain} hint="A subdomain like mail.yourbusiness.lk is best: it won't affect your normal email.">
              <TextInput name="domain" placeholder="mail.yourbusiness.lk" maxLength={253} autoComplete="off" spellCheck={false} error={errors.domain} hasHint />
            </Field>
            <Field label="Address name" name="fromLocal" error={errors.fromLocal}>
              <TextInput name="fromLocal" placeholder="feedback" defaultValue="feedback" maxLength={32} autoComplete="off" error={errors.fromLocal} />
            </Field>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add domain"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">Only the owner can set this up.</p>
      )}
    </SettingsSection>
  );
}
