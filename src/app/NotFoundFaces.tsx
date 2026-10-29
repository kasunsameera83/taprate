"use client";
import { useState } from "react";

// A tiny joke for the 404 page: rate the missing page. Nothing is sent anywhere.
const FACES = [
  { face: "😡", label: "Very annoyed", reply: "Fair. We'd be cross too. Let's get you somewhere useful." },
  { face: "🙁", label: "Not great", reply: "Sorry about that. The links below should help." },
  { face: "😐", label: "Meh", reply: "Honest feedback. We appreciate it." },
  { face: "🙂", label: "Fine", reply: "That's kind, for a page that isn't here." },
  { face: "😍", label: "Love it", reply: "You're very generous. Thanks for the tap!" },
];

export function NotFoundFaces() {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="mt-8">
      <p className="text-sm font-semibold text-muted">How would you rate this missing page?</p>
      <div className="mt-3 flex justify-center gap-2" role="group" aria-label="Rate this page">
        {FACES.map((f, i) => (
          <button
            key={f.label}
            type="button"
            aria-label={f.label}
            aria-pressed={picked === i}
            onClick={() => setPicked(i)}
            className={`nf-face flex h-12 w-12 items-center justify-center rounded-[12px] border bg-surface text-[24px] transition-transform hover:-translate-y-0.5 motion-reduce:transition-none ${
              picked === i ? "border-brand ring-2 ring-brand/30" : "border-line"
            }`}
            style={{ animationDelay: `${i * 0.12}s` }}
          >
            {f.face}
          </button>
        ))}
      </div>
      <p className="mt-3 min-h-6 text-sm text-ink" aria-live="polite">
        {picked !== null ? FACES[picked]!.reply : ""}
      </p>
    </div>
  );
}
