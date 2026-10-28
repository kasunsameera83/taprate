"use client";
import Link from "next/link";
import { useEffect } from "react";

// Shown when a page crashes. Tells the person what to do, and quietly reports the error.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(error?.message ?? "Unknown error").slice(0, 500), digest: error?.digest, path: window.location.pathname }),
    }).catch(() => {});
  }, [error]);
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-5">
      <div className="panel w-full max-w-md space-y-3 p-6 text-center">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted">Sorry about that. We&rsquo;ve been told about it. Try again, or go back to the start.</p>
        {error?.digest && <p className="text-[12px] text-muted">Reference: {error.digest}</p>}
        <div className="flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
