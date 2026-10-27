"use client";
import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-[var(--muted)]">{hint}</p>}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ error, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string; name: string }) {
  return (
    <input
      id={props.name}
      className="input"
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? `${props.name}-error` : undefined}
      {...props}
    />
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2 text-sm ${kind === "error" ? "bg-red-50 text-[var(--danger)]" : "bg-green-50 text-[var(--ok)]"}`}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}
