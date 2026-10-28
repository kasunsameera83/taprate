"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/icons";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "Questions" },
];

// Sticky site navigation. Gains a border once you scroll; on phones the links move into a menu sheet.
export function SiteHeader({ cta = "Start free", showPricing = true }: { cta?: string; showPricing?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const links = LINKS.filter((l) => showPricing || l.href !== "/#pricing");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 transition-[background-color,border-color] duration-200 ${scrolled ? "border-b border-line bg-canvas/90 backdrop-blur" : "border-b border-transparent bg-canvas"}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="TapRate home" className="shrink-0">
          <Logo />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-[8px] px-3 py-2 text-[15px] font-medium text-muted hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            {cta}
          </Link>
          <button type="button" className="btn btn-ghost px-3 md:hidden" aria-label="Open menu" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
      <dialog
        ref={menu}
        aria-label="Menu"
        onClick={(e) => {
          if (e.target === menu.current || (e.target as HTMLElement).closest("a")) menu.current?.close();
        }}
        className="mb-0 mt-auto max-h-[85vh] w-full max-w-none rounded-t-[20px] border-0 bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 md:hidden"
      >
        <div className="px-5 pt-3" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
          <nav aria-label="Site" className="grid">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="flex min-h-12 items-center border-b border-line text-lg font-semibold">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-5 grid gap-2">
            <Link href="/signup" className="btn btn-primary min-h-12">
              {cta}
            </Link>
            <Link href="/login" className="btn btn-secondary min-h-12">
              Sign in
            </Link>
          </div>
        </div>
      </dialog>
    </header>
  );
}
