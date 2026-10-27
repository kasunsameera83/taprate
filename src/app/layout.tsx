import type { Metadata } from "next";
import "./globals.css";

// Rendered per request so Next.js can attach the CSP nonce from middleware to its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "TapRate", template: "%s · TapRate" },
  description: "One-click customer feedback inside the emails you already send.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
