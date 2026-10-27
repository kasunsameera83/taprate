"use client";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; fields?: Record<string, string> };

/** Browser-side fetch for our own API. Always JSON, same-origin cookies only. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  if (!path.startsWith("/api/")) throw new Error("api() only calls our own /api routes");
  try {
    const res = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: true; data: T }
      | { ok: false; error: { message: string; fields?: Record<string, string> } }
      | null;
    if (res.status === 401 && typeof window !== "undefined") {
      const code = json && !json.ok ? (json.error as { code?: string }).code : undefined;
      const here = window.location.pathname;
      if (code === "mfa_required" && !here.startsWith("/login/verify")) {
        window.location.assign(here.startsWith("/reset-password") ? "/login/verify?next=reset" : "/login/verify");
      }
      else if (code !== "mfa_required" && (here.startsWith("/app") || here.startsWith("/welcome"))) window.location.assign("/login");
    }
    if (json && json.ok) return { ok: true, data: json.data };
    return {
      ok: false,
      status: res.status,
      message: json && !json.ok ? json.error.message : "Something went wrong. Please try again.",
      fields: json && !json.ok ? json.error.fields : undefined,
    };
  } catch {
    return { ok: false, status: 0, message: "Network problem. Check your connection and try again." };
  }
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
