"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Notice } from "@/components/ui";
import { Busy } from "@/components/FaceLoader";

// "Continue with Google". Shown only when NEXT_PUBLIC_GOOGLE_AUTH=true (set after Google is configured in
// Supabase). The server starts the sign-in and returns Google's page, which must be on our Supabase host.
export const GOOGLE_AUTH_ON = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true";

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ intent, refCode }: { intent: "signup" | "login"; refCode?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!GOOGLE_AUTH_ON) return null;

  async function start() {
    setBusy(true);
    setError("");
    const r = await api<{ url: string }>("/api/auth/google", { method: "POST", body: { intent, acceptTerms: true, ...(refCode ? { ref: refCode } : {}) } });
    if (r.ok) {
      window.location.assign(r.data.url);
      return;
    }
    setBusy(false);
    setError(r.message);
  }

  return (
    <div className="space-y-3">
      {error && <Notice kind="error">{error}</Notice>}
      <button type="button" onClick={start} disabled={busy} className="btn btn-secondary flex min-h-12 w-full items-center justify-center gap-3 text-base">
        {busy ? (
          <Busy>Opening Google…</Busy>
        ) : (
          <>
            <GoogleG />
            Continue with Google
          </>
        )}
      </button>
      <p className="text-center text-[13px] text-muted">
        {intent === "signup" ? "By continuing with Google, you agree to the " : "New here? Continuing with Google creates an account and means you agree to the "}
        <Link href="/terms" target="_blank" className="link">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="link">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="flex items-center gap-3 text-[13px] text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or use your email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
