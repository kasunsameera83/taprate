"use client";
import Link from "next/link";
import { useState } from "react";
import { formatMoney, type BillingInterval, type Catalog, type Currency } from "@/lib/billing/catalog";
import { Badge, Segmented } from "@/components/ui";

export function PricingTable({ catalog }: { catalog: Catalog }) {
  const [currency, setCurrency] = useState<Currency>("LKR");
  const [interval, setInterval_] = useState<BillingInterval>("month");
  const plans = catalog.plans.filter((p) => p.active);
  const packs = catalog.packs.filter((p) => p.active);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Currency" value={currency} onChange={setCurrency} options={[{ value: "LKR", label: "LKR" }, { value: "USD", label: "USD" }]} />
        <Segmented label="Billing period" value={interval} onChange={setInterval_} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={`flex flex-col rounded-[var(--radius-panel)] border bg-surface p-6 ${p.id === "growth" ? "border-brand shadow-sm" : "border-line"}`}>
            <p className="flex items-center justify-between text-lg font-semibold">
              {p.name}
              {p.id === "growth" && <Badge tone="brand">Popular</Badge>}
            </p>
            <p className="mt-3 text-3xl font-bold">
              {formatMoney(p.price[currency][interval], currency)}
              <span className="text-base font-normal text-muted"> / {interval === "year" ? "year" : "month"}</span>
            </p>
            <p className="mt-2 text-sm font-semibold">{p.monthlyResponses.toLocaleString("en")} responses a month</p>
            <p className="mt-1 flex-1 text-sm text-muted">{p.blurb}</p>
            <Link href="/signup" className={`btn mt-5 ${p.id === "growth" ? "btn-primary" : "btn-secondary"}`}>
              Start free
            </Link>
          </div>
        ))}
      </div>
      {packs.length > 0 && (
        <p className="mt-5 text-sm text-muted">
          Need more? Top-ups from {formatMoney(Math.min(...packs.map((k) => k.price[currency])), currency)} for {Math.min(...packs.map((k) => k.responses)).toLocaleString("en")} responses. They never expire.
        </p>
      )}
    </div>
  );
}
