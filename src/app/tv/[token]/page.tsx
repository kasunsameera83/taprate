import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseKioskToken } from "@/lib/security/signing";
import { TvClient } from "./TvClient";

export const metadata: Metadata = { title: "Customer feedback · live", robots: { index: false, follow: false } };

// Read-only live screen for the office wall. The link is checked by the API on every refresh.
export default async function TvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!parseKioskToken(token)) notFound();
  return <TvClient token={token} />;
}
