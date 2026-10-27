"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { IconDashboard, IconLogout, IconResponses, IconSettings, IconSurveys, Logo } from "@/components/icons";

const NAV = [
  { href: "/app", label: "Dashboard", icon: IconDashboard, exact: true },
  { href: "/app/surveys", label: "Surveys", icon: IconSurveys },
  { href: "/app/responses", label: "Responses", icon: IconResponses },
  { href: "/app/settings", label: "Settings", icon: IconSettings },
];

const TRIAL_CREDITS = 50;

export function AppNav({ email, accountName, plan, credits }: { email: string; accountName: string; plan: string; credits: number }) {
  const path = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));
  const low = credits <= 10;

  async function signOut() {
    setSigningOut(true);
    await api("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <Link href="/app" className="px-2" aria-label="TapRate dashboard">
          <Logo />
        </Link>
        <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold transition-colors ${
                  active ? "bg-brand-soft text-brand" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-[12px] border border-line p-3">
            <p className="text-sm font-semibold">{accountName}</p>
            <p className="mt-0.5 text-[13px] capitalize text-muted">{plan} plan</p>
            <div className="mt-3 flex items-baseline justify-between text-[13px]">
              <span className="text-muted">Responses left</span>
              <span className={`tabular font-semibold ${low ? "text-neg-text" : "text-ink"}`}>{credits}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eceef2]" aria-hidden>
              <div
                className={`h-full rounded-full ${low ? "bg-neg-fill" : "bg-brand"}`}
                style={{ width: `${Math.min(100, (credits / TRIAL_CREDITS) * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="truncate text-[13px] text-muted" title={email}>
              {email}
            </span>
            <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-ghost btn-sm shrink-0" aria-label="Sign out">
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link href="/app" aria-label="TapRate dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <span className={`tabular text-[13px] font-semibold ${low ? "text-neg-text" : "text-muted"}`}>{credits} left</span>
            <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-ghost btn-sm" aria-label="Sign out">
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold ${
                  active ? "bg-brand-soft text-brand" : "text-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
