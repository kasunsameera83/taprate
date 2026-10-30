"use client";
import Link from "next/link";
import { useState } from "react";
import { formatMoney, SEND_LIMITS, type BillingInterval, type Catalog, type Currency } from "@/lib/billing/catalog";
import { Badge, Segmented } from "@/components/ui";

// Prices are shown in ONE currency, picked from where the visitor is: rupees in Sri Lanka, US dollars
// everywhere else. (A Sri Lankan price shown to an overseas visitor looks out of place.)
export function PricingTable({ catalog, defaultCurrency = "LKR" }: { catalog: Catalog; defaultCurrency?: Currency }) {
  const currency = defaultCurrency;
  const [interval, setInterval_] = useState<BillingInterval>("month");
  const plans = catalog.plans.filter((p) => p.active);
  const packs = catalog.packs.filter((p) => p.active);
  const free = catalog.free ?? { responses: 0, dailyEmails: 0 };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Billing period" value={interval} onChange={setInterval_} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />
      </div>
      <div className={`mt-6 grid gap-4 ${free.responses > 0 ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}>
        {free.responses > 0 && (
          <div className="flex flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-6">
            <p className="text-lg font-semibold">Free</p>
            <p className="mt-3 text-3xl font-bold">
              {currency === "LKR" ? "Rs 0" : "$0"}
              <span className="text-base font-normal text-muted"> forever</span>
            </p>
            <p className="mt-2 text-sm font-semibold">{free.responses.toLocaleString("en")} responses to start</p>
            <ul className="mt-3 flex-1 space-y-1 text-[13px] text-muted">
              <li>✓ Email, QR, WhatsApp &amp; kiosk surveys</li>
              <li>✓ Rating buttons for your own emails, no limit</li>
              {free.dailyEmails > 0 && <li>✓ We send surveys for you: {free.dailyEmails.toLocaleString("en")} emails a day</li>}
              <li>✓ Dashboard, follow-ups &amp; alerts</li>
              <li>✓ 1 location, 2 team members</li>
              <li>No card needed</li>
            </ul>
            <Link href="/signup" className="btn btn-secondary mt-5">
              Start free
            </Link>
          </div>
        )}
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
            <p className="mt-1 text-sm text-muted">{p.blurb}</p>
            <ul className="mt-3 flex-1 space-y-1 text-[13px] text-muted">
              <li>✓ Everything in Free, plus:</li>
              <li>✓ We send surveys for you: {SEND_LIMITS[p.id].toLocaleString("en")} emails a day</li>
              <li>✓ Unlimited team &amp; locations</li>
              <li>✓ Helpdesk, Shopify &amp; Slack, API</li>
              <li>✓ TV screens, AI replies, email reports</li>
              <li>✓ Social media share cards</li>
              {p.id === "scale" && <li className="font-semibold text-ink">✓ Emails from your own domain</li>}
            </ul>
            <Link href="/signup" className={`btn mt-5 ${p.id === "growth" ? "btn-primary" : "btn-secondary"}`}>
              Choose {p.name}
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted">
        {currency === "LKR" ? "Prices in Sri Lankan rupees. Pay securely with PayHere." : "Prices in US dollars. Pay securely by card with Stripe."}{" "}
        <Link href="/refund-policy" className="underline underline-offset-2 hover:text-ink">
          Refund Policy
        </Link>
      </p>
      {packs.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          Need more? Top-ups from {formatMoney(Math.min(...packs.map((k) => k.price[currency])), currency)} for {Math.min(...packs.map((k) => k.responses)).toLocaleString("en")} responses. They never expire.
        </p>
      )}
    </div>
  );
}
