"use client";
import { useId, useState, type KeyboardEvent } from "react";
import { driverLabel } from "@/lib/validation/schemas";

/** Editable list of short labels (reasons). Same rules as the server: up to 8, each 1–40 characters, no duplicates. */
export function ChipListInput({
  label,
  name,
  values,
  onChange,
  max = 8,
  error,
}: {
  label: string;
  name: string;
  values: string[];
  onChange: (v: string[]) => void;
  max?: number;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState("");
  const hintId = useId();

  function add() {
    const parsed = driverLabel.safeParse(draft);
    if (!parsed.success) return setLocalError(parsed.error.issues[0]?.message ?? "Check the reason");
    if (values.some((v) => v.toLowerCase() === parsed.data.toLowerCase())) return setLocalError("That reason is already in the list");
    if (values.length >= max) return setLocalError(`Up to ${max} reasons`);
    onChange([...values, parsed.data]);
    setDraft("");
    setLocalError("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  const shownError = localError || error;
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-semibold">
        {label}
      </label>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {values.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas py-1 pl-3 pr-1 text-sm">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-[#e6e8ee] hover:text-ink"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {values.length < max && (
        <div className="flex gap-2">
          <input
            id={name}
            className="input"
            value={draft}
            maxLength={40}
            placeholder="Add a reason, e.g. Fast reply"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            aria-invalid={shownError ? "true" : undefined}
            aria-describedby={hintId}
          />
          <button type="button" className="btn btn-secondary shrink-0" onClick={add} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      )}
      <p id={hintId} className={`text-[13px] ${shownError ? "text-neg-text" : "text-muted"}`}>
        {shownError || `${values.length} of ${max}. Keep them short so they fit on a phone.`}
      </p>
    </div>
  );
}
