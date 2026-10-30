"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Notice } from "@/components/ui";
import { Busy } from "@/components/FaceLoader";

export function StopEmailsButton({ r, t, business }: { r: string; t: string; business: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  if (state === "done") return <Notice kind="success">Done. {business} won&rsquo;t send you survey emails any more.</Notice>;
  return (
    <div className="space-y-3">
      {error && <Notice kind="error">{error}</Notice>}
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await api("/api/public/unsubscribe", { method: "POST", body: { r, t } });
          if (res.ok) setState("done");
          else {
            setState("idle");
            setError(res.message);
          }
        }}
      >
        {state === "busy" ? <Busy>Stopping…</Busy> : "Stop survey emails"}
      </button>
    </div>
  );
}
