import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { verifyHighlightsToken } from "@/lib/security/signing";
import { loadHighlights } from "@/lib/share/highlights";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  const t = verifyHighlightsToken(env().linkSecrets, token);
  return t ? loadHighlights(t.accountId, t.month) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const h = await load(token);
  if (!h) return { title: "Not available", robots: { index: false, follow: false } };
  const title = `${h.businessName} in ${h.monthLabel}: ${h.happyPct}% happy customers`;
  const description = `${h.total.toLocaleString("en")} ratings from customers in ${h.monthLabel}.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { type: "article", title, description, url: `/h/${token}`, images: [{ url: `/h/${token}/image`, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [`/h/${token}/image`] },
  };
}

// What people see when they open a shared "our month" link.
export default async function HighlightsPage({ params }: Props) {
  const { token } = await params;
  const h = await load(token);
  if (!h) notFound();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(135deg,#3555f6,#553cf7)] px-4 py-10 text-white">
      <div className="w-full max-w-2xl text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {h.logo && <img src={h.logo} alt={h.businessName} className="mx-auto mb-6 max-h-16 max-w-[220px] rounded-[12px] object-contain" />}
        <p className="text-lg text-white/80">{h.monthLabel}</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight sm:text-[40px]">{h.businessName}</h1>
        <p className="font-display mt-8 text-[96px] font-bold leading-none sm:text-[120px]">{h.happyPct}%</p>
        <p className="mt-2 text-xl">happy customers</p>
        <p className="mt-1 text-white/80">from {h.total.toLocaleString("en")} ratings</p>
        {h.quote && (
          <figure className="mx-auto mt-10 max-w-xl rounded-[24px] bg-white/15 p-6 text-left">
            <blockquote className="whitespace-pre-line break-words text-xl font-semibold leading-snug">&ldquo;{h.quote.text}&rdquo;</blockquote>
            <figcaption className="mt-3 text-white/80">— {h.quote.name}</figcaption>
          </figure>
        )}
        {h.branding && (
          <p className="mt-10 text-sm text-white/85">
            Collected with{" "}
            <Link href="/" className="font-semibold text-white underline-offset-4 hover:underline">
              TapTruly
            </Link>
            .{" "}
            <Link href="/signup" className="font-semibold text-white underline underline-offset-4">
              Try it free
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
