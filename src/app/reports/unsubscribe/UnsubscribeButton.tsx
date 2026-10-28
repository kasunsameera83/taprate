"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Notice } from "@/components/ui";

export function UnsubscribeButton({ target, t }: { target: { s: string } | { w: string }; t: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  if (state === "done") return <Notice kind="success">Done. You won&rsquo;t get these emails any more.</Notice>;
  return (
    <div className="space-y-3">
      {error && <Notice kind="error">{error}</Notice>}
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const r = await api("/api/reports/unsubscribe", { method: "POST", body: { ...target, t } });
          if (r.ok) setState("done");
          else {
            setState("idle");
            setError(r.message);
          }
        }}
      >
        Stop these emails
      </button>
    </div>
  );
}
