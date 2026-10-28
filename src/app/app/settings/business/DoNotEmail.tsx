"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, qs } from "@/lib/client/api";
import { suppressionSchema } from "@/lib/validation/sending";
import { Badge, Field, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";

type Item = { email: string; reason: "unsubscribed" | "added_by_team" | string; createdAt: string };
const REASON: Record<string, string> = { unsubscribed: "Unsubscribed", added_by_team: "Added by your team" };

// People TapRate will never send survey emails to for this business.
export function DoNotEmail() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const load = useCallback(() => {
    api<{ items: Item[] }>("/api/suppressions").then((r) => (r.ok ? setItems(r.data.items) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    const p = suppressionSchema.safeParse({ email });
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Enter a valid email address");
    setError("");
    const r = await api("/api/suppressions", { method: "POST", body: p.data });
    if (!r.ok) return setError(r.message);
    setEmail("");
    setNotice(`${p.data} won't get survey emails from your business.`);
    load();
  }

  async function remove(addr: string) {
    const r = await api<{ removed: boolean }>(`/api/suppressions${qs({ email: addr })}`, { method: "DELETE" });
    if (!r.ok) return setError(r.message);
    load();
  }

  const shown = (items ?? []).filter((i) => !filter || i.email.includes(filter.toLowerCase()));
  return (
    <SettingsSection
      title="Do-not-email list"
      description="People TapRate will never send your survey emails to. Customers who unsubscribe are added automatically, and only they can undo it."
    >
      <form onSubmit={add} noValidate className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <Field label="Add an email" name="suppressEmail" error={error || undefined}>
            <TextInput name="suppressEmail" type="email" inputMode="email" placeholder="customer@example.com" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} error={error || undefined} />
          </Field>
        </div>
        <button className="btn btn-secondary">Add</button>
      </form>
      {notice && (
        <div className="mt-3">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}
      <div className="mt-4">
        {!items ? (
          <Skeleton className="h-16 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">Nobody yet.</p>
        ) : (
          <>
            {items.length > 8 && (
              <input className="input mb-2 sm:max-w-xs" placeholder="Search" aria-label="Search the list" value={filter} onChange={(e) => setFilter(e.target.value)} />
            )}
            <ul className="max-h-72 divide-y divide-line overflow-auto rounded-[10px] border border-line">
              {shown.slice(0, 300).map((i) => (
                <li key={i.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{i.email}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={i.reason === "unsubscribed" ? "neu" : "plain"}>{REASON[i.reason] ?? i.reason}</Badge>
                    {i.reason === "added_by_team" && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(i.email)} aria-label={`Remove ${i.email}`}>
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
