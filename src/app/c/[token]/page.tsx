import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { verifyCardToken } from "@/lib/security/signing";
import { loadShareCard } from "@/lib/share/card";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  const id = verifyCardToken(env().linkSecrets, token);
  return id ? loadShareCard(id) : null;
}

// What people see when they tap a shared card on WhatsApp/Facebook/LinkedIn/X. The link preview uses the
// card picture. Not indexed by search engines.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const card = await load(token);
  if (!card) return { title: "Not available", robots: { index: false, follow: false } };
  const title = `${card.name} on ${card.businessName}`;
  const image = `/c/${token}/image`;
  return {
    title: { absolute: title },
    description: card.comment,
    robots: { index: false, follow: false },
    openGraph: { type: "article", title, description: card.comment, url: `/c/${token}`, images: [{ url: image, width: 1200, height: 630, alt: `“${card.comment}” by ${card.name}` }] },
    twitter: { card: "summary_large_image", title, description: card.comment, images: [image] },
  };
}

export default async function SharedCardPage({ params }: Props) {
  const { token } = await params;
  const card = await load(token);
  if (!card) notFound();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10" style={{ background: card.color }}>
      <figure className="w-full max-w-2xl rounded-[28px] bg-white p-8 shadow-xl sm:p-10">
        {card.stars !== null ? (
          <p className="text-[28px] tracking-wider" aria-label={`${card.stars} out of 5 stars`}>
            <span className="text-[#f59e0b]">{"★".repeat(card.stars)}</span>
            <span className="text-line">{"★".repeat(5 - card.stars)}</span>
          </p>
        ) : (
          card.label && <p className="inline-block rounded-full bg-pos-soft px-4 py-1.5 text-sm font-bold text-pos-text">{card.label}</p>
        )}
        {/* Customer text is rendered as plain text (React escapes it). */}
        <blockquote className="mt-5 whitespace-pre-line break-words text-[24px] font-semibold leading-snug text-ink sm:text-[28px]">&ldquo;{card.comment}&rdquo;</blockquote>
        <figcaption className="mt-6 flex items-center justify-between gap-4">
          <span>
            <span className="block font-bold text-ink">{card.name}</span>
            <span className="block text-sm text-muted">about {card.businessName}</span>
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {card.logo && <img src={card.logo} alt={card.businessName} className="max-h-14 max-w-[160px] object-contain" />}
        </figcaption>
      </figure>
      <p className="mt-8 text-center text-sm text-white/90">
        Collected with{" "}
        <Link href="/" className="font-semibold text-white underline-offset-4 hover:underline">
          TapTruly
        </Link>
        , one-tap customer feedback.{" "}
        <Link href="/signup" className="font-semibold text-white underline underline-offset-4">
          Try it free
        </Link>
      </p>
    </main>
  );
}
