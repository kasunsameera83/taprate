"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { catalogItemSchema } from "@/lib/site/content";
import { fieldErrors } from "@/lib/validation/schemas";
import type { Catalog, Pack, Plan } from "@/lib/billing/catalog";
import { LoadError, Notice, Skeleton } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";

const major = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");

function Money({ label, value, onChange, error, prefix }: { label: string; value: string; onChange: (v: string) => void; error?: string; prefix: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted">{prefix}</span>
        <input className="input" inputMode="decimal" value={value} maxLength={14} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? "true" : undefined} />
      </span>
      {error && <span className="block text-[13px] font-medium text-neg-text">{error}</span>}
    </label>
  );
}

export default function PricingAdmin() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Catalog>("/api/admin/pricing").then((r) => (r.ok ? setCatalog(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!catalog) return <Skeleton className="h-96 w-full rounded-[var(--radius-panel)]" />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold leading-tight">Pricing</h1>
        <p className="text-sm text-muted">Changes apply to new purchases straight away, and show on the landing page and the billing page. Existing subscriptions keep the price they signed up at.</p>
      </div>
      {catalog.plans.map((p) => (
        <PlanForm key={p.id} plan={p} onSaved={load} />
      ))}
      {catalog.packs.map((k) => (
        <PackForm key={k.id} pack={k} onSaved={load} />
      ))}
    </div>
  );
}

function useSave(onSaved: () => void) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(raw: unknown, summary: string) {
    const parsed = catalogItemSchema.safeParse(raw);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    if (!(await confirmDialog({ title: "Save new prices?", body: summary, confirmLabel: "Save" }))) return;
    setBusy(true);
    // The server parses the same strings again; amounts are sent as typed.
    const r = await api("/api/admin/pricing", { method: "PUT", body: raw });
    setBusy(false);
    if (r.ok) {
      setMsg({ kind: "success", text: "Saved." });
      onSaved();
    } else {
      setErrors(r.fields ?? {});
      setMsg({ kind: "error", text: r.message });
    }
  }
  return { errors, msg, busy, save };
}

function PlanForm({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const [v, setV] = useState({
    name: plan.name,
    blurb: plan.blurb,
    responses: String(plan.monthlyResponses),
    lkrMonth: major(plan.price.LKR.month),
    lkrYear: major(plan.price.LKR.year),
    usdMonth: major(plan.price.USD.month),
    usdYear: major(plan.price.USD.year),
    active: plan.active,
  });
  const { errors, msg, busy, save } = useSave(onSaved);
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch });
  return (
    <SettingsSection title={`${plan.name} plan`}>
      <div className="space-y-4">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Name</span>
            <input className="input" value={v.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
            {errors.name && <span className="block text-[13px] text-neg-text">{errors.name}</span>}
          </label>
          <label className="block space-y-1 text-sm sm:col-span-2">
            <span className="font-semibold">Description</span>
            <input className="input" value={v.blurb} maxLength={120} onChange={(e) => set({ blurb: e.target.value })} />
            {errors.blurb && <span className="block text-[13px] text-neg-text">{errors.blurb}</span>}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Responses per month</span>
            <input className="input" inputMode="numeric" value={v.responses} maxLength={7} onChange={(e) => set({ responses: e.target.value })} />
            {errors.responses && <span className="block text-[13px] text-neg-text">{errors.responses}</span>}
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Money label="LKR monthly" prefix="Rs" value={v.lkrMonth} onChange={(x) => set({ lkrMonth: x })} error={errors.lkrMonth} />
          <Money label="LKR yearly" prefix="Rs" value={v.lkrYear} onChange={(x) => set({ lkrYear: x })} error={errors.lkrYear} />
          <Money label="USD monthly" prefix="$" value={v.usdMonth} onChange={(x) => set({ usdMonth: x })} error={errors.usdMonth} />
          <Money label="USD yearly" prefix="$" value={v.usdYear} onChange={(x) => set({ usdYear: x })} error={errors.usdYear} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />
          On sale (untick to hide it from new customers)
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            save(
              { kind: "plan", item: plan.id, name: v.name, blurb: v.blurb, responses: /^\d+$/.test(v.responses) ? Number(v.responses) : NaN, lkrMonth: v.lkrMonth, lkrYear: v.lkrYear, usdMonth: v.usdMonth, usdYear: v.usdYear, active: v.active },
              `${v.name}: Rs ${v.lkrMonth} / month, Rs ${v.lkrYear} / year, $${v.usdMonth} / month, $${v.usdYear} / year, ${v.responses} responses a month.`,
            )
          }
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </SettingsSection>
  );
}

function PackForm({ pack, onSaved }: { pack: Pack; onSaved: () => void }) {
  const [v, setV] = useState({ name: pack.name, responses: String(pack.responses), lkrPrice: major(pack.price.LKR), usdPrice: major(pack.price.USD), active: pack.active });
  const { errors, msg, busy, save } = useSave(onSaved);
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch });
  return (
    <SettingsSection title={`Top-up: ${pack.name}`}>
      <div className="space-y-4">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Name</span>
            <input className="input" value={v.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
            {errors.name && <span className="block text-[13px] text-neg-text">{errors.name}</span>}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Responses</span>
            <input className="input" inputMode="numeric" value={v.responses} maxLength={7} onChange={(e) => set({ responses: e.target.value })} />
            {errors.responses && <span className="block text-[13px] text-neg-text">{errors.responses}</span>}
          </label>
          <Money label="LKR price" prefix="Rs" value={v.lkrPrice} onChange={(x) => set({ lkrPrice: x })} error={errors.lkrPrice} />
          <Money label="USD price" prefix="$" value={v.usdPrice} onChange={(x) => set({ usdPrice: x })} error={errors.usdPrice} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />
          On sale
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            save(
              { kind: "topup", item: pack.id, name: v.name, responses: /^\d+$/.test(v.responses) ? Number(v.responses) : NaN, lkrPrice: v.lkrPrice, usdPrice: v.usdPrice, active: v.active },
              `${v.name}: ${v.responses} responses for Rs ${v.lkrPrice} or $${v.usdPrice}.`,
            )
          }
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </SettingsSection>
  );
}
