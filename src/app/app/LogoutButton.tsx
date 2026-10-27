"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/auth/logout", { method: "POST" });
        window.location.assign("/login");
      }}
    >
      Sign out
    </button>
  );
}
