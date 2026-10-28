"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { ROLE_LABEL, type Role } from "@/lib/security/authz";
import { IconDashboard, IconFollowUp, IconLogout, IconResponses, IconSettings, IconSurveys, IconTrophy, Logo } from "@/components/icons";

const NAV = [
  { href: "/app", label: "Dashboard", icon: IconDashboard, exact: true },
  { href: "/app/surveys", label: "Surveys", icon: IconSurveys },
  { href: "/app/responses", label: "Responses", icon: IconResponses },
  { href: "/app/follow-ups", label: "Follow-ups", icon: IconFollowUp },
  { href: "/app/leaderboard", label: "Leaderboard", icon: IconTrophy },
  { href: "/app/settings", label: "Settings", icon: IconSettings },
];

// On phones the first four are tabs at the bottom; the rest live under "More".
const PRIMARY = NAV.slice(0, 4);
const MORE = NAV.slice(4);

const TRIAL_CREDITS = 50;

type Props = {
  isPlatformAdmin?: boolean;
  email: string;
  accountId: string;
  accountName: string;
  role: Role;
  plan: string;
  credits: number;
  accounts: Array<{ id: string; name: string; role: Role }>;
};

function AccountSwitcher({ accountId, accountName, role, accounts, compact = false }: Pick<Props, "accountId" | "accountName" | "role" | "accounts"> & { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (accounts.length < 2) {
    return compact ? null : (
      <div>
        <p className="truncate text-sm font-semibold">{accountName}</p>
        <p className="text-[13px] text-muted">{ROLE_LABEL[role]}</p>
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={compact ? "acct-m" : "acct-d"} className={compact ? "sr-only" : "mb-1 block text-[13px] text-muted"}>
        Business
      </label>
      <select
        id={compact ? "acct-m" : "acct-d"}
        className={`input ${compact ? "min-h-9 py-1 text-sm" : ""}`}
        value={accountId}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          const r = await api("/api/account/switch", { method: "POST", body: { accountId: e.target.value } });
          if (r.ok) window.location.assign("/app");
          else {
            setBusy(false);
            setError(r.message);
          }
        }}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({ROLE_LABEL[a.role]})
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[12px] text-neg-text">{error}</p>}
    </div>
  );
}

export function AppNav({ isPlatformAdmin = false, email, accountId, accountName, role, plan, credits, accounts }: Props) {
  const path = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));
  const low = credits <= 10;
  const showCredits = role === "owner" || role === "admin";

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
          <div className="space-y-3 rounded-[12px] border border-line p-3">
            <AccountSwitcher accountId={accountId} accountName={accountName} role={role} accounts={accounts} />
            {showCredits && (
              <div>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="capitalize text-muted">{plan} plan</span>
                  <span className={`tabular font-semibold ${low ? "text-neg-text" : "text-ink"}`}>{credits} left</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eceef2]" aria-hidden>
                  <div className={`h-full rounded-full ${low ? "bg-neg-fill" : "bg-brand"}`} style={{ width: `${Math.min(100, (credits / TRIAL_CREDITS) * 100)}%` }} />
                </div>
                {role === "owner" && (
                  <Link href="/app/settings/billing" className="mt-2 inline-block text-[13px] font-semibold text-brand hover:underline">
                    {low ? "Top up responses" : "Plans & billing"}
                  </Link>
                )}
              </div>
            )}
          </div>
          {isPlatformAdmin && (
            <Link href="/admin" className="btn btn-secondary btn-sm w-full">
              Product admin
            </Link>
          )}
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

      {/* Phones and tablets: slim top bar + bottom tab bar (thumb-reachable), "More" opens a sheet. */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4">
          <Link href="/app" aria-label="TapRate dashboard" className="shrink-0">
            <Logo />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-muted">{accountName}</span>
            {showCredits &&
              (role === "owner" ? (
                <Link
                  href="/app/settings/billing"
                  className={`tabular shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold ${low ? "bg-neg-soft text-neg-text" : "bg-canvas text-ink"}`}
                  aria-label={`${credits} responses left. Plans and billing`}
                >
                  {credits} left
                </Link>
              ) : (
                <span className={`tabular shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold ${low ? "bg-neg-soft text-neg-text" : "bg-canvas text-ink"}`}>{credits} left</span>
              ))}
          </div>
        </div>
      </header>

      <MobileTabs
        isActive={isActive}
        more={
          <div className="space-y-4">
            <nav aria-label="More" className="grid gap-1">
              {MORE.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(href, exact);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold ${active ? "bg-brand-soft text-brand" : "text-ink hover:bg-canvas"}`}
                  >
                    <Icon />
                    {label}
                  </Link>
                );
              })}
              {role === "owner" && (
                <Link href="/app/settings/billing" className="flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold text-ink hover:bg-canvas">
                  <span aria-hidden className="flex h-5 w-5 items-center justify-center">💳</span>
                  Plans &amp; billing
                </Link>
              )}
              {isPlatformAdmin && (
                <Link href="/admin" className="flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold text-ink hover:bg-canvas">
                  <span aria-hidden className="flex h-5 w-5 items-center justify-center">🛠️</span>
                  Product admin
                </Link>
              )}
            </nav>
            <div className="rounded-[12px] border border-line p-3">
              <AccountSwitcher accountId={accountId} accountName={accountName} role={role} accounts={accounts} />
              {showCredits && (
                <p className="mt-2 text-[13px] text-muted">
                  <span className="capitalize">{plan}</span> plan · <span className={`font-semibold ${low ? "text-neg-text" : "text-ink"}`}>{credits} responses left</span>
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] text-muted" title={email}>
                {email}
              </span>
              <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-secondary btn-sm shrink-0">
                <IconLogout className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        }
      />
    </>
  );
}

function IconMore({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-5 w-5"} aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function MobileTabs({ isActive, more }: { isActive: (href: string, exact?: boolean) => boolean; more: ReactNode }) {
  const path = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((m) => isActive(m.href, m.exact));

  // Close the sheet after navigating.
  useEffect(() => {
    sheet.current?.close();
  }, [path]);

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {PRIMARY.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-brand" : "text-muted"}`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-brand-soft" : ""}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => {
                sheet.current?.showModal();
                setOpen(true);
              }}
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${moreActive ? "text-brand" : "text-muted"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? "bg-brand-soft" : ""}`}>
                <IconMore className="h-5 w-5" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
      <dialog
        ref={sheet}
        aria-label="More"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === sheet.current) sheet.current?.close();
        }}
        className="mb-0 mt-auto max-h-[85vh] w-full max-w-none overflow-y-auto rounded-t-[20px] border-0 bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40 sm:mx-auto sm:max-w-lg lg:hidden"
      >
        <div className="px-4 pb-4 pt-2" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
          <div className="mb-2 flex items-center justify-between">
            <p className="text-lg font-semibold">More</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sheet.current?.close()} aria-label="Close menu">
              ✕
            </button>
          </div>
          {more}
        </div>
      </dialog>
    </>
  );
}
