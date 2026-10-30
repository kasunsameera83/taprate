import type { Metadata } from "next";
import { loadCatalog } from "@/lib/billing/catalogServer";

export async function generateMetadata(): Promise<Metadata> {
  const { free } = await loadCatalog();
  return {
    title: "Start free: one-click customer feedback",
    description: `Create your TapTruly account in a minute. ${free.responses.toLocaleString("en")} free responses, no card needed. Add one-tap ratings to your emails, QR codes, WhatsApp and kiosks.`,
    alternates: { canonical: "/signup" },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
