"use client";
import { useEffect, useRef, useState } from "react";
import { IconAlert } from "./icons";

// In-app confirmation dialog (replaces the browser's window.confirm).
// Usage:  if (!(await confirmDialog({ title: "Revoke key?", body: "…", confirmLabel: "Revoke", danger: true }))) return;
// <ConfirmHost /> is mounted once in the signed-in layout. Built on the native <dialog> element, so the
// browser handles focus trapping, Esc to cancel and hiding the page behind it from screen readers.

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let show: ((p: Pending) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      // Host not mounted (shouldn't happen): fall back to the browser's own dialog rather than act silently.
      resolve(window.confirm(options.body ? `${options.title}\n\n${options.body}` : options.title));
      return;
    }
    show({ ...options, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (p) => setPending((cur) => {
      cur?.resolve(false); // only one at a time
      return p;
    });
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (pending && !d.open) {
      d.showModal();
      // Safer default: focus "Cancel" for destructive actions, the main button otherwise.
      if (pending.danger) cancelRef.current?.focus();
    } else if (!pending && d.open) d.close();
  }, [pending]);

  function finish(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      aria-describedby={pending?.body ? "confirm-body" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
      onClick={(e) => {
        if (e.target === ref.current) finish(false); // click on the backdrop
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      {pending && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            {pending.danger && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neg-soft text-neg-text">
                <IconAlert className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h2 id="confirm-title" className="text-lg font-semibold leading-snug">
                {pending.title}
              </h2>
              {pending.body && (
                <p id="confirm-body" className="mt-1.5 text-sm text-muted">
                  {pending.body}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={() => finish(false)}>
              {pending.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              autoFocus={!pending.danger}
              className={pending.danger ? "btn border-neg-fill bg-neg-fill text-white hover:bg-neg-text" : "btn btn-primary"}
              onClick={() => finish(true)}
            >
              {pending.confirmLabel ?? "Confirm"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
