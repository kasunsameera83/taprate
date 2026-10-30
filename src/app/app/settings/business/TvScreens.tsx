"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import type { Location, Survey } from "@/lib/client/types";
import { fieldErrors, tvScreenCreateSchema } from "@/lib/validation/schemas";
import { Field, Notice, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PaidFeatureNotice } from "@/components/PlanContext";
import { Busy } from "@/components/FaceLoader";

type Screen = { id: string; name: string; survey: string | null; location: string | null; showComments: boolean; createdAt: string; lastSeenAt: string | null };

// A live, read-only screen for the office wall or a team TV.
export function TvScreens() {
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [created, setCreated] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Screen[]>("/api/tv-screens").then((r) => (r.ok ? setScreens(r.data) : setMsg(r.message)));
  }, []);
  useEffect(() => {
    load();
    api<Survey[]>("/api/surveys").then((r) => r.ok && setSurveys(r.data.filter((s) => s.status !== "archived")));
    api<Location[]>("/api/locations").then((r) => r.ok && setLocations(r.data.filter((l) => !l.archived)));
  }, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const p = tvScreenCreateSchema.safeParse({
      name: String(f.get("tvName") ?? ""),
      surveyId: String(f.get("tvSurvey") ?? "") || null,
      locationId: String(f.get("tvLocation") ?? "") || null,
      showComments: f.get("tvComments") === "on",
    });
    if (!p.success) return setErrors(fieldErrors(p.error));
    setErrors({});
    setBusy(true);
    const r = await api<{ id: string; url: string }>("/api/tv-screens", { method: "POST", body: p.data });
    setBusy(false);
    if (!r.ok) return setMsg(r.message);
    formEl.reset();
    setCreated(r.data.url);
    load();
  }

  async function revoke(s: Screen) {
    if (!(await confirmDialog({ title: `Switch off “${s.name}”?`, body: "The screen stops updating straight away. You can make a new link any time.", confirmLabel: "Switch off", danger: true }))) return;
    const r = await api(`/api/tv-screens/${encodeURIComponent(s.id)}`, { method: "DELETE" });
    if (!r.ok) setMsg(r.message);
    load();
  }

  return (
    <SettingsSection title="Office TV screens" description="A live screen for your office wall: today's satisfaction, the latest ratings and kind words from customers. It never shows emails or names.">
      <div className="space-y-4">
        <PaidFeatureNotice feature="tv" />
        {msg && <Notice kind="error">{msg}</Notice>}
        {created && (
          <Notice kind="success">
            Open this link on the TV&rsquo;s browser and make it full screen. It&rsquo;s shown only once, so save it now.
            <code className="mt-2 block break-all rounded bg-white px-1.5 py-1 text-[12px]">{created}</code>
          </Notice>
        )}
        {!screens ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          screens.length > 0 && (
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {screens.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>
                    <span className="font-semibold">{s.name}</span>
                    <span className="block text-[12px] text-muted">
                      {[s.survey ?? "All surveys", s.location ?? "All branches", s.showComments ? "shows comments" : "no comments"].join(" · ")}
                      {" · "}
                      {s.lastSeenAt ? `last on ${new Date(s.lastSeenAt).toLocaleString()}` : "not opened yet"}
                    </span>
                  </span>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => revoke(s)}>
                    Switch off
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
        <form onSubmit={create} noValidate className="space-y-3 rounded-[12px] border border-line p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Screen name" name="tvName" error={errors.name}>
              <TextInput name="tvName" placeholder="e.g. Support room TV" maxLength={60} error={errors.name} />
            </Field>
            <Field label="Survey" name="tvSurvey">
              <select id="tvSurvey" name="tvSurvey" className="input" defaultValue="">
                <option value="">All surveys</option>
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Branch" name="tvLocation">
              <select id="tvLocation" name="tvLocation" className="input" defaultValue="" disabled={locations.length === 0}>
                <option value="">All branches</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="tvComments" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" />
            <span>
              <span className="font-semibold">Show kind words from happy customers</span>
              <span className="block text-[13px] text-muted">Only the comment text is shown, without names or emails.</span>
            </span>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <Busy>Creating…</Busy> : "Create TV link"}
          </button>
        </form>
      </div>
    </SettingsSection>
  );
}
