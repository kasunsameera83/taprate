import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are downloaded at build time and served from our own domain (CSP: font-src 'self').
// Ibrand: the TapTruly brand typeface, for headings. Bundled with the app (src/app/fonts).
const display = localFont({ src: "./fonts/Ibrand.woff", variable: "--font-ibrand", display: "swap", weight: "400" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });

// Rendered per request so Next.js can attach the CSP nonce from middleware to its scripts.
export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export const metadata: Metadata = {
  // Absolute links for canonical URLs, sitemaps and social previews.
  metadataBase: new URL(SITE),
  title: { default: "TapTruly", template: "%s | TapTruly" },
  description: "One-tap customer feedback in emails, QR codes, WhatsApp, your website and kiosks.",
  applicationName: "TapTruly",
  openGraph: { type: "website", siteName: "TapTruly", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: { apple: "/apple-icon-180.png" },
  appleWebApp: { capable: true, title: "TapTruly", statusBarStyle: "default" },
};

// viewport-fit=cover lets the bottom tab bar sit above the iPhone home indicator (safe-area padding).
export const viewport: Viewport = { themeColor: "#f8fafc", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
