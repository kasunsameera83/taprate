import Link from "next/link";
import { COMPANY } from "@/lib/site/company";
import { Logo } from "@/components/icons";

// Site footer: what you can do, who we are, and the legal pages.
/** sriLanka: show "Made in Sri Lanka" (only to visitors in Sri Lanka; see SiteFooterAuto). */
export function SiteFooter({ tagline, sriLanka = false }: { tagline?: string; sriLanka?: boolean }) {
  const email = COMPANY.supportEmail.replace(/[[\]]/g, "");
  const columns = [
    {
      title: "Product",
      links: [
        { href: "/#how", label: "How it works" },
        { href: "/#features", label: "Features" },
        { href: "/#pricing", label: "Pricing" },
        { href: "/#faq", label: "Questions" },
        { href: "/blog", label: "Blog" },
      ],
    },
    {
      title: "Get started",
      links: [
        { href: "/signup", label: "Create a free account" },
        { href: "/login", label: "Sign in" },
        { href: "/compare", label: "Compare with other tools" },
        { href: "/switch-from-delighted", label: "Switching from Delighted" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/terms", label: "Terms of Service" },
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/refund-policy", label: "Refund Policy" },
        { href: "/.well-known/security.txt", label: "Report a security issue" },
      ],
    },
  ];
  return (
    <footer className="bg-ink text-[#cbd5e1]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="max-w-xs">
          <Logo variant="white" height={30} />
          <p className="mt-2 text-sm leading-relaxed">{tagline || "One-click customer feedback inside the emails you already send."}</p>
          <a href={`mailto:${email}`} className="mt-4 inline-block text-sm font-semibold text-white underline-offset-4 hover:underline">
            {email}
          </a>
          {COMPANY.phone && (
            <a href={`tel:${COMPANY.phone.replace(/[^+\d]/g, "")}`} className="mt-1 block text-sm font-semibold text-white underline-offset-4 hover:underline">
              {COMPANY.phone}
            </a>
          )}
          <div className="mt-4 flex gap-2">
            <a
              href={COMPANY.social.facebook}
              target="_blank"
              rel="noopener noreferrer me"
              aria-label="TapTruly on Facebook"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-[#1877F2]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9z" />
              </svg>
            </a>
          </div>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-sm font-semibold text-white">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("/#") || l.href.startsWith("/.") ? (
                    <a href={l.href} className="hover:text-white">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="hover:text-white">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[13px]">
          <span>
            &copy; {new Date().getFullYear()} {COMPANY.productName}
          </span>
          {sriLanka && <span>Made in Sri Lanka 🇱🇰</span>}
        </div>
      </div>
    </footer>
  );
}
