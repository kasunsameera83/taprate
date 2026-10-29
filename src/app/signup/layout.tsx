import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start free: one-click customer feedback",
  description: "Create your TapTruly account in a minute. 50 free responses, no card needed. Add one-tap ratings to your emails, QR codes, WhatsApp and kiosks.",
  alternates: { canonical: "/signup" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
