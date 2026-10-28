import "server-only";
import { headers } from "next/headers";
import type { Currency } from "@/lib/billing/catalog";

/**
 * Visitor's country from the hosting platform (Vercel sets x-vercel-ip-country at its edge; Cloudflare
 * sets cf-ipcountry). Only used to pick which currency to SHOW first: it never changes a price, and
 * people can always switch. Locally there's no header, so development shows rupees.
 */
export async function visitorCountry(): Promise<string | null> {
  const h = await headers();
  const c = (h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export async function preferredCurrency(): Promise<Currency> {
  const country = await visitorCountry();
  if (country) return country === "LK" ? "LKR" : "USD";
  return process.env.NODE_ENV === "production" ? "USD" : "LKR";
}
