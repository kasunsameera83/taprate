"use client";
import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/client/api";
import { Notice, Skeleton } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";

type Info = { configured: boolean; publicKey: string | null; devices: Array<{ id: string; device: string | null; created_at: string; last_used_at: string | null }> };
type InstallEvent = Event & { prompt: () => Promise<void> };

const b64uToBytes = (s: string) => {
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "This device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

/** Alerts on this phone or computer the moment a customer is unhappy, and installing TapRate as an app. */
export function PhoneAlerts() {
  const [info, setInfo] = useState<Info | null>(null);
  const [supported, setSupported] = useState(true);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [thisOn, setThisOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);

  const load = useCallback(() => {
    api<Info>("/api/push/subscriptions").then((r) => r.ok && setInfo(r.data));
  }, []);

  useEffect(() => {
    load();
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    setIos(/iPhone|iPad/.test(navigator.userAgent));
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    navigator.serviceWorker?.getRegistration("/").then(async (reg) => setThisOn(Boolean(await reg?.pushManager.getSubscription())));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [load]);

  async function turnOn() {
    if (!info?.publicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg({ kind: "error", text: "Notifications are blocked for TapRate in this browser. Allow them in the browser's site settings, then try again." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(info.publicKey) }));
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const r = await api("/api/push/subscriptions", { method: "POST", body: { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth }, device: deviceName() } });
      if (!r.ok) {
        await sub.unsubscribe().catch(() => undefined);
        setMsg({ kind: "error", text: r.message });
        return;
      }
      setThisOn(true);
      setMsg({ kind: "success", text: "Alerts are on for this device. Send a test to check." });
      load();
    } catch {
      setMsg({ kind: "error", text: "This browser couldn't turn on alerts. Try Chrome, Edge or Firefox, or install TapRate first on iPhone." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOffThis() {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
    setThisOn(false);
    load();
  }

  async function remove(id: string) {
    await api(`/api/push/subscriptions${qs({ id })}`, { method: "DELETE" });
    load();
  }

  async function test() {
    setMsg(null);
    const r = await api<{ sent: number }>("/api/push/test", { method: "POST" });
    setMsg(r.ok ? { kind: "success", text: `Test sent to ${r.data.sent} ${r.data.sent === 1 ? "device" : "devices"}.` } : { kind: "error", text: r.message });
  }

  return (
    <SettingsSection title="Phone alerts" description="Get a notification on your phone or computer the moment a customer gives a bad rating. Alerts never show the customer's details.">
      {!info ? (
        <Skeleton className="h-20 w-full" />
      ) : !info.configured ? (
        <Notice kind="info">Phone alerts aren&rsquo;t set up on this server yet (VAPID keys). See DEPLOY.md.</Notice>
      ) : (
        <div className="space-y-4">
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          {ios && !standalone ? (
            <Notice kind="info">
              On iPhone, first add TapRate to your Home Screen: tap the Share button, then &ldquo;Add to Home Screen&rdquo;. Open TapRate from there and turn alerts on.
            </Notice>
          ) : !supported ? (
            <Notice kind="info">This browser doesn&rsquo;t support alerts. Try Chrome, Edge or Firefox.</Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              {thisOn ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={test}>
                    Send a test alert
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={turnOffThis}>
                    Turn off on this device
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={turnOn}>
                  {busy ? "Turning on…" : "Turn on alerts on this device"}
                </button>
              )}
              {install && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    await install.prompt();
                    setInstall(null);
                  }}
                >
                  Install TapRate as an app
                </button>
              )}
            </div>
          )}
          {info.devices.length > 0 && (
            <ul className="divide-y divide-line rounded-[10px] border border-line text-sm">
              {info.devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="font-semibold">{d.device ?? "Device"}</span>
                    <span className="block text-[12px] text-muted">{d.last_used_at ? `Last alert ${new Date(d.last_used_at).toLocaleString()}` : `Added ${new Date(d.created_at).toLocaleDateString()}`}</span>
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(d.id)} aria-label={`Remove ${d.device ?? "device"}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
