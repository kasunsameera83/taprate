"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import type { Location } from "@/lib/client/types";
import { fieldErrors, locationCreateSchema, locationUpdateSchema } from "@/lib/validation/schemas";
import { Badge, EmptyState, Field, LoadError, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PlanLimitNotice } from "@/components/PlanContext";

// Branches: shops, counters, clinics or regions. Each gets its own QR codes and kiosks, and the
// dashboard compares them.
export default function LocationsPage() {
  const [items, setItems] = useState<Location[] | null>(null);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const load = useCallback(() => {
    setError("");
    api<Location[]>("/api/locations").then((r) => (r.ok ? setItems(r.data) : setError(r.message)));
  }, []);
  useEffect(() => {
    load();
    api<{ role: string | null }>("/api/account").then((r) => r.ok && setCanEdit(r.data.role === "owner" || r.data.role === "admin"));
  }, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  const active = (items ?? []).filter((l) => !l.archived);
  const archived = (items ?? []).filter((l) => l.archived);

  return (
    <div className="space-y-6">
      {items && <PlanLimitNotice what="locations" used={active.length} />}
      <SettingsSection
        title="Branches"
        description={
          <>
            Add each shop, counter or clinic. Then make a QR code or kiosk for a branch in a survey&rsquo;s{" "}
            <span className="font-semibold">QR, WhatsApp &amp; more</span> tab, and compare branches on the <Link href="/app" className="font-semibold text-brand hover:underline">dashboard</Link>.
          </>
        }
      >
        {canEdit && <AddBranch onAdded={load} />}
        <div className="mt-5">
          {!items ? (
            <Skeleton className="h-24 w-full" />
          ) : active.length === 0 ? (
            <EmptyState title="No branches yet" body="With one location you don't need any. Add branches when you have more than one place customers visit." />
          ) : (
            <ul className="divide-y divide-line rounded-[12px] border border-line">
              {active.map((l) => (
                <BranchRow key={l.id} item={l} canEdit={canEdit} onChanged={load} />
              ))}
            </ul>
          )}
        </div>
      </SettingsSection>

      {archived.length > 0 && (
        <SettingsSection title="Archived branches" description="Their old ratings are kept. New ratings aren't tagged with them.">
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {archived.map((l) => (
              <BranchRow key={l.id} item={l} canEdit={canEdit} onChanged={load} />
            ))}
          </ul>
        </SettingsSection>
      )}
    </div>
  );
}

function AddBranch({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone("");
    const p = locationCreateSchema.safeParse({ name });
    if (!p.success) return setError(fieldErrors(p.error).name ?? "Check the name");
    setError("");
    setBusy(true);
    const r = await api<{ id: string }>("/api/locations", { method: "POST", body: p.data });
    setBusy(false);
    if (!r.ok) return setError(r.fields?.name ?? r.message);
    setName("");
    setDone(`${p.data.name} added.`);
    onAdded();
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <Field label="New branch" name="branchName" error={error || undefined}>
            <TextInput name="branchName" placeholder="e.g. Kandy, Colombo 07, Airport counter" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} error={error || undefined} autoComplete="off" />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <Busy>Adding…</Busy> : "Add branch"}
        </button>
      </div>
      {done && <Notice kind="success">{done}</Notice>}
    </form>
  );
}

function BranchRow({ item, canEdit, onChanged }: { item: Location; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [error, setError] = useState("");

  async function save(archived: boolean, newName = name) {
    const p = locationUpdateSchema.safeParse({ name: newName, archived });
    if (!p.success) return setError(fieldErrors(p.error).name ?? "Check the name");
    const r = await api(`/api/locations/${encodeURIComponent(item.id)}`, { method: "PATCH", body: p.data });
    if (!r.ok) return setError(r.fields?.name ?? r.message);
    setError("");
    setEditing(false);
    onChanged();
  }

  async function archive() {
    if (!(await confirmDialog({ title: `Archive “${item.name}”?`, body: "Its QR codes and kiosks keep working, but new ratings won't be tagged with this branch. Old ratings are kept.", confirmLabel: "Archive" }))) return;
    save(true, item.name);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {editing ? (
        <form
          className="flex flex-1 flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(item.archived);
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={`rename-${item.id}`} className="sr-only">
              Branch name
            </label>
            <input id={`rename-${item.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus aria-invalid={error ? "true" : undefined} />
            {error && <p className="mt-1 text-[13px] font-medium text-neg-text">{error}</p>}
          </div>
          <button className="btn btn-primary btn-sm min-h-10">Save</button>
          <button type="button" className="btn btn-ghost btn-sm min-h-10" onClick={() => {
              setEditing(false);
              setName(item.name);
              setError("");
            }}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 font-semibold">
            {item.name} {item.archived && <Badge tone="plain">Archived</Badge>}
          </span>
          {canEdit && (
            <span className="flex gap-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Rename ${item.name}`}>
                Rename
              </button>
              {item.archived ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(false, item.name)}>
                  Restore
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={archive}>
                  Archive
                </button>
              )}
            </span>
          )}
          {error && <p className="w-full text-[13px] font-medium text-neg-text">{error}</p>}
        </>
      )}
    </li>
  );
}
