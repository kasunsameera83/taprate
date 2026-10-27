import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain (CSP: font-src 'self').
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", weight: ["500", "600", "700"] });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });

// Rendered per request so Next.js can attach the CSP nonce from middleware to its scripts.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "TapRate", template: "%s | TapRate" },
  description: "One-click customer feedback inside the emails you already send.",
};

export const viewport: Viewport = { themeColor: "#f5f6f8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
