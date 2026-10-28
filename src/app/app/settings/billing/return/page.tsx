"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { Notice, Skeleton } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";

type Order = { id: string; kind: "plan" | "topup"; item: string; status: "pending" | "paid" | "failed" | "cancelled" | "refunded"; credits: number };

// Where PayHere / Stripe send the customer back. Coming back here grants NOTHING: we only show what the
// provider's signed notification has already told our server, checking every few seconds.
function ReturnView() {
  const orderId = useSearchParams().get("order") ?? "";
  const valid = /^[0-9a-f-]{36}$/.test(orderId);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState(valid ? "" : "This payment link isn't valid.");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!valid) return;
    let tries = 0;
    let stop = false;
    const tick = async () => {
      const r = await api<Order>(`/api/billing/orders/${orderId}`);
      if (stop) return;
      if (!r.ok) return setError(r.message);
      setOrder(r.data);
      if (r.data.status !== "pending") return;
      if (++tries >= 30) return setTimedOut(true);
      setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [orderId, valid]);

  return (
    <SettingsSection title="Payment">
      {error && <Notice kind="error">{error}</Notice>}
      {!error && (!order || order.status === "pending") && !timedOut && (
        <div className="space-y-3" role="status" aria-live="polite">
          <p className="text-sm">Confirming your payment with the provider…</p>
          <Skeleton className="h-2 w-48" />
        </div>
      )}
      {timedOut && order?.status === "pending" && (
        <Notice kind="info">This is taking longer than usual. You don&rsquo;t need to pay again: we&rsquo;ll update your plan as soon as the payment is confirmed. Check back in a few minutes.</Notice>
      )}
      {order?.status === "paid" && (
        <Notice kind="success">
          Payment received. {order.kind === "plan" ? "Your plan is active and" : ""} {order.credits.toLocaleString()} responses were added to your balance.
        </Notice>
      )}
      {(order?.status === "failed" || order?.status === "cancelled") && <Notice kind="error">The payment didn&rsquo;t go through, and nothing was charged. You can try again.</Notice>}
      <p className="mt-4">
        <Link href="/app/settings/billing" className="btn btn-secondary">
          Back to billing
        </Link>
      </p>
    </SettingsSection>
  );
}

export default function BillingReturnPage() {
  return (
    <Suspense>
      <ReturnView />
    </Suspense>
  );
}
