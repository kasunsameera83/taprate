"use client";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import type { Sentiment } from "@/lib/surveys/iconSets";
import { IconAlert, IconCheck, IconEye, IconEyeOff } from "./icons";

export function Field({
  label,
  name,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-semibold text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${name}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="flex items-start gap-1.5 text-[13px] font-medium text-neg-text">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(name: string, error?: string, hint?: boolean) {
  if (error) return `${name}-error`;
  if (hint) return `${name}-hint`;
  return undefined;
}

export function TextInput({
  error,
  hasHint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string; name: string; hasHint?: boolean }) {
  return (
    <input
      id={props.name}
      className={`input ${className ?? ""}`}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={describedBy(props.name, error, hasHint)}
      {...props}
    />
  );
}

/** Password field with show/hide (WCAG 3.3.8: paste and password managers always allowed). */
export function PasswordInput({ error, hasHint, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string; name: string; hasHint?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={props.name}
        type={shown ? "text" : "password"}
        className="input pr-12"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy(props.name, error, hasHint)}
        autoCapitalize="none"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
      >
        {shown ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  if (!children) return null;
  const styles = {
    error: "bg-neg-soft text-neg-text border-[#f3cccc]",
    success: "bg-pos-soft text-pos-text border-[#c6e7d3]",
    info: "bg-brand-soft text-ink border-[#d5d9ff]",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-[10px] border px-3.5 py-2.5 text-sm ${styles}`}>
      {kind === "error" ? <IconAlert className="mt-0.5 h-4 w-4 shrink-0" /> : kind === "success" ? <IconCheck className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <div>{children}</div>
    </div>
  );
}

export function Badge({ tone, children }: { tone: "pos" | "neu" | "neg" | "brand" | "plain"; children: ReactNode }) {
  const styles = {
    pos: "bg-pos-soft text-pos-text",
    neu: "bg-neu-soft text-neu-text",
    neg: "bg-neg-soft text-neg-text",
    brand: "bg-brand-soft text-brand",
    plain: "bg-[#f1f5f9] text-muted",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}>{children}</span>;
}

export const SENTIMENT_LABEL: Record<Sentiment, string> = { positive: "Positive", neutral: "Neutral", negative: "Negative" };
const SENTIMENT_DOT: Record<Sentiment, string> = { positive: "bg-pos-fill", neutral: "bg-neu-fill", negative: "bg-neg-fill" };

export function SentimentDot({ sentiment }: { sentiment: Sentiment }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${SENTIMENT_DOT[sentiment]}`} aria-hidden />;
}

/** Accessible segmented control (radio group). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = "md",
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] border border-line-strong bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            id={`${id}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-[8px] px-3 font-semibold transition-colors ${size === "sm" ? "min-h-8 text-[13px]" : "min-h-10 text-sm"} ${
              active ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`skeleton max-w-full ${className}`} aria-hidden />;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role="status">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-1 max-w-md text-sm text-muted">{body}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#f3cccc] bg-neg-soft px-4 py-3 text-sm text-neg-text" role="alert">
      <span className="flex items-center gap-2">
        <IconAlert className="h-4 w-4" />
        {message}
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
