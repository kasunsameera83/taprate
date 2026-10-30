"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Busy } from "@/components/FaceLoader";

const WAIT = 60; // seconds between sends

/** "Didn't get it? Send again", with a one-minute wait between tries. */
export function ResendConfirmation({ email, startWaiting = true }: { email: string; startWaiting?: boolean }) {
  const [left, setLeft] = useState(startWaiting ? WAIT : 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await api<{ message: string }>("/api/auth/resend", { method: "POST", body: { email } });
    setBusy(false);
    setLeft(WAIT);
    setMsg(r.ok ? { ok: true, text: "Sent again. Check your inbox and spam folder." } : { ok: false, text: r.message });
  }

  return (
    <div className="text-sm">
      <p className="text-muted">
        Didn&rsquo;t get it?{" "}
        {left > 0 ? (
          <span>You can send it again in {left}s.</span>
        ) : (
          <button type="button" className="link" disabled={busy} onClick={send}>
            {busy ? <Busy>Sending…</Busy> : "Send the email again"}
          </button>
        )}
      </p>
      {msg && (
        <p className={`mt-1 ${msg.ok ? "text-pos-text" : "text-neg-text"}`} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
