import Link from "next/link";
import { COMPANY } from "@/lib/site/company";
import { Logo } from "@/components/icons";

// Site footer: what you can do, who we are, and the legal pages.
export function SiteFooter({ tagline }: { tagline?: string }) {
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
        { href: "/switch-from-delighted", label: "Switching from Delighted" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/terms", label: "Terms of Service" },
        { href: "/privacy", label: "Privacy Policy" },
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
            &copy; {new Date().getFullYear()} {COMPANY.legalName.replace(/[[\]]/g, "")}
          </span>
          <span>Made in Sri Lanka</span>
        </div>
      </div>
    </footer>
  );
}
