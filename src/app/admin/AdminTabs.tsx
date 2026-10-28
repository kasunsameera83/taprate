"use client";
import { TabNav } from "@/components/TabNav";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/landing", label: "Landing page" },
  { href: "/admin/promotions", label: "Pop-ups & greetings" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/promos", label: "Promo codes" },
  { href: "/admin/activity", label: "Admin log" },
];

export function AdminTabs() {
  return <TabNav label="Admin" tabs={TABS} exactRoot="/admin" />;
}
