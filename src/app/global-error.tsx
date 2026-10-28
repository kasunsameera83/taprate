"use client";
import { useEffect } from "react";

// Last-resort error page (when even the main layout fails). Has to bring its own <html>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(error?.message ?? "Unknown error").slice(0, 500), digest: error?.digest, path: window.location.pathname }),
    }).catch(() => {});
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, Helvetica, sans-serif", background: "#f5f6f8", color: "#151a2d", margin: 0 }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", border: "1px solid #e1e4eb", borderRadius: 14, padding: 24, maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: "#586074", margin: "0 0 16px" }}>Sorry about that. Please try again.</p>
            <button type="button" onClick={() => reset()} style={{ minHeight: 44, padding: "0 18px", borderRadius: 10, border: 0, background: "#2f3bf5", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
