import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/icons";
import { NotFoundFaces } from "./NotFoundFaces";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

// 404: shown for unknown addresses and for expired or changed links (survey, TV and wall links).
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-6xl px-5 py-5">
        <Link href="/" aria-label="TapTruly home" className="inline-block">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-5 pb-16 text-center">
        <p aria-hidden className="nf-404 font-display text-[96px] leading-none sm:text-[128px]">
          404
        </p>
        <h1 className="mt-4 text-[28px] leading-tight sm:text-[34px]">This page couldn&rsquo;t be found</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          The address may be mistyped, or the link may have expired or been switched off. If someone sent it to you, ask them for a new one.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary min-h-12 px-6">
            Go to the home page
          </Link>
          <Link href="/app" className="btn btn-secondary min-h-12 px-6">
            Open my dashboard
          </Link>
        </div>
        <NotFoundFaces />
        <nav aria-label="Helpful links" className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <Link href="/#features" className="link">Features</Link>
          <Link href="/#pricing" className="link">Pricing</Link>
          <Link href="/#faq" className="link">Questions</Link>
          <Link href="/login" className="link">Sign in</Link>
        </nav>
      </main>
    </div>
  );
}
