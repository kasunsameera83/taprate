"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { promoCodeSchema, fieldErrors } from "@/lib/validation/schemas";
import { formatMoney, type Currency } from "@/lib/billing/catalog";
import { Badge, EmptyState, Field, LoadError, Notice, Segmented, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Busy } from "@/components/FaceLoader";

type Kind = "percent" | "amount" | "credits";
type PromoRow = {
  id: string;
  code: string;
  description: string;
  kind: Kind;
  percentOff: number | null;
  amountOffLkr: number | null;
  amountOffUsd: number | null;
  bonusCredits: number | null;
  appliesTo: string[];
  maxUses: number | null;
  startsAt: string;
  endsAt: string | null;
  enabled: boolean;
  uses: number;
  revenue: Partial<Record<Currency, number>>;
};

const ITEMS = [
  { id: "starter", label: "Starter" },
  { id: "growth", label: "Growth" },
  { id: "scale", label: "Scale" },
  { id: "pack_250", label: "250 top-up" },
  { id: "pack_1000", label: "1,000 top-up" },
  { id: "pack_5000", label: "5,000 top-up" },
] as const;

const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");
const major = (m: number | null) => (m === null ? "" : (m / 100).toFixed(2).replace(/\.00$/, ""));

function gives(p: PromoRow): string {
  if (p.kind === "percent") return `${p.percentOff}% off`;
  if (p.kind === "credits") return `+${(p.bonusCredits ?? 0).toLocaleString()} bonus responses`;
  return [p.amountOffLkr ? `${formatMoney(p.amountOffLkr, "LKR")} off` : "", p.amountOffUsd ? `${formatMoney(p.amountOffUsd, "USD")} off` : ""].filter(Boolean).join(" / ");
}

type Draft = {
  id: string | null;
  code: string;
  description: string;
  kind: Kind;
  percentOff: string;
  amountOffLkr: string;
  amountOffUsd: string;
  bonusCredits: string;
  appliesTo: string[];
  maxUses: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

const blank = (): Draft => ({
  id: null,
  code: "",
  description: "",
  kind: "percent",
  percentOff: "20",
  amountOffLkr: "",
  amountOffUsd: "",
  bonusCredits: "",
  appliesTo: [],
  maxUses: "",
  startsAt: new Date().toISOString(),
  endsAt: "",
  enabled: true,
});

export default function PromoCodesPage() {
  const [items, setItems] = useState<PromoRow[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const load = useCallback(() => {
    setError("");
    api<PromoRow[]>("/api/admin/promos").then((r) => (r.ok ? setItems(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Promo codes</h1>
          <p className="text-sm text-muted">Customers type the code on the Billing page. Each business can use a code once. Plan discounts stay for the life of that subscription.</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing(blank())}>
            New code
          </button>
        )}
      </div>
      {editing && <Editor draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <SettingsSection title="All codes">
        {error && <LoadError message={error} onRetry={load} />}
        {!items && !error && <Skeleton className="h-24 w-full" />}
        {items && items.length === 0 && <EmptyState title="No codes yet" body="Create one for a launch offer, a partner or a season." />}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((p) => {
              const ended = p.endsAt !== null && Date.parse(p.endsAt) <= Date.now();
              const full = p.maxUses !== null && p.uses >= p.maxUses;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">{p.code}</code>
                      <span className="text-sm">{gives(p)}</span>
                      {!p.enabled ? <Badge tone="plain">Off</Badge> : ended ? <Badge tone="plain">Ended</Badge> : full ? <Badge tone="neu">Fully used</Badge> : <Badge tone="pos">Active</Badge>}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {p.uses.toLocaleString()} used{p.maxUses !== null ? ` of ${p.maxUses.toLocaleString()}` : ""}
                      {Object.keys(p.revenue).length > 0 && ` · brought in ${(Object.entries(p.revenue) as Array<[Currency, number]>).map(([c, v]) => formatMoney(Number(v), c)).join(" + ")}`}
                      {" · "}
                      {p.appliesTo.length ? p.appliesTo.map((i) => ITEMS.find((x) => x.id === i)?.label ?? i).join(", ") : "everything"}
                      {p.endsAt ? ` · until ${new Date(p.endsAt).toLocaleDateString()}` : ""}
                      {p.description ? ` · ${p.description}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          code: p.code,
                          description: p.description,
                          kind: p.kind,
                          percentOff: p.percentOff ? String(p.percentOff) : "",
                          amountOffLkr: major(p.amountOffLkr),
                          amountOffUsd: major(p.amountOffUsd),
                          bonusCredits: p.bonusCredits ? String(p.bonusCredits) : "",
                          appliesTo: p.appliesTo,
                          maxUses: p.maxUses ? String(p.maxUses) : "",
                          startsAt: p.startsAt,
                          endsAt: p.endsAt ?? "",
                          enabled: p.enabled,
                        })
                      }
                    >
                      Edit
                    </button>
                    {p.uses === 0 && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={async () => {
                          if (!(await confirmDialog({ title: `Delete ${p.code}?`, body: "It will stop working straight away.", confirmLabel: "Delete", danger: true }))) return;
                          const r = await api(`/api/admin/promos/${p.id}`, { method: "DELETE" });
                          if (r.ok) load();
                          else setError(r.message);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}

function Editor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const int = (v: string) => (v.trim() === "" ? null : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
  const editing = d.id !== null;

  async function save() {
    const raw = {
      code: d.code,
      description: d.description,
      kind: d.kind,
      percentOff: d.kind === "percent" ? int(d.percentOff) : null,
      amountOffLkr: d.kind === "amount" ? d.amountOffLkr : null,
      amountOffUsd: d.kind === "amount" ? d.amountOffUsd : null,
      bonusCredits: d.kind === "credits" ? int(d.bonusCredits) : null,
      appliesTo: d.appliesTo,
      maxUses: int(d.maxUses),
      startsAt: d.startsAt,
      endsAt: d.endsAt || null,
      enabled: d.enabled,
    };
    const parsed = promoCodeSchema.safeParse(raw);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const r = await api(editing ? `/api/admin/promos/${d.id}` : "/api/admin/promos", { method: editing ? "PUT" : "POST", body: raw });
    setBusy(false);
    if (r.ok) onSaved();
    else {
      setErrors(r.fields ?? {});
      setMsg(r.message);
    }
  }

  return (
    <SettingsSection title={editing ? `Edit ${d.code}` : "New promo code"}>
      <div className="space-y-4">
        {msg && <Notice kind="error">{msg}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" name="pcCode" hint={editing ? "Can't change after creating." : "4–30 letters or numbers, e.g. AVURUDU20"} error={errors.code}>
            <TextInput name="pcCode" value={d.code} disabled={editing} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} maxLength={30} hasHint error={errors.code} autoComplete="off" />
          </Field>
          <Field label="Note" name="pcDesc" optional hint="Only you see this." error={errors.description}>
            <TextInput name="pcDesc" value={d.description} onChange={(e) => set({ description: e.target.value })} maxLength={120} hasHint error={errors.description} />
          </Field>
        </div>
        {!editing && (
          <Segmented
            label="Code gives"
            value={d.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: "percent", label: "% off" },
              { value: "amount", label: "Amount off" },
              { value: "credits", label: "Bonus responses" },
            ]}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {d.kind === "percent" && (
            <Field label="Percent off" name="pcPct" hint="1–90" error={errors.percentOff}>
              <TextInput name="pcPct" inputMode="numeric" value={d.percentOff} onChange={(e) => set({ percentOff: e.target.value })} maxLength={2} hasHint error={errors.percentOff} />
            </Field>
          )}
          {d.kind === "amount" && (
            <>
              <Field label="Rs off (PayHere)" name="pcLkr" optional error={errors.amountOffLkr}>
                <TextInput name="pcLkr" inputMode="decimal" value={d.amountOffLkr} onChange={(e) => set({ amountOffLkr: e.target.value })} maxLength={12} error={errors.amountOffLkr} />
              </Field>
              <Field label="$ off (Stripe)" name="pcUsd" optional error={errors.amountOffUsd}>
                <TextInput name="pcUsd" inputMode="decimal" value={d.amountOffUsd} onChange={(e) => set({ amountOffUsd: e.target.value })} maxLength={12} error={errors.amountOffUsd} />
              </Field>
            </>
          )}
          {d.kind === "credits" && (
            <Field label="Bonus responses" name="pcBonus" hint="Added with the first payment" error={errors.bonusCredits}>
              <TextInput name="pcBonus" inputMode="numeric" value={d.bonusCredits} onChange={(e) => set({ bonusCredits: e.target.value })} maxLength={7} hasHint error={errors.bonusCredits} />
            </Field>
          )}
          <Field label="Total uses allowed" name="pcMax" optional hint="Empty = no limit" error={errors.maxUses}>
            <TextInput name="pcMax" inputMode="numeric" value={d.maxUses} onChange={(e) => set({ maxUses: e.target.value })} maxLength={7} hasHint error={errors.maxUses} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Works on</legend>
          <p className="text-[13px] text-muted">Tick none for everything.</p>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {ITEMS.map((i) => (
              <label key={i.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-brand)]"
                  checked={d.appliesTo.includes(i.id)}
                  onChange={(e) => set({ appliesTo: e.target.checked ? [...d.appliesTo, i.id] : d.appliesTo.filter((x) => x !== i.id) })}
                />
                {i.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" name="pcStart" error={errors.startsAt}>
            <TextInput name="pcStart" type="datetime-local" value={toLocal(d.startsAt)} onChange={(e) => set({ startsAt: fromLocal(e.target.value) })} error={errors.startsAt} />
          </Field>
          <Field label="Ends" name="pcEnd" optional hint="Empty = no end date" error={errors.endsAt}>
            <TextInput name="pcEnd" type="datetime-local" value={d.endsAt ? toLocal(d.endsAt) : ""} onChange={(e) => set({ endsAt: fromLocal(e.target.value) })} hasHint error={errors.endsAt} />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Switched on
        </label>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? <Busy>Saving…</Busy> : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}
