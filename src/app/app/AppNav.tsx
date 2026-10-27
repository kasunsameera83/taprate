"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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

const TRIAL_CREDITS = 50;

type Props = {
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

export function AppNav({ email, accountId, accountName, role, plan, credits, accounts }: Props) {
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
              </div>
            )}
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
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/app" aria-label="TapRate dashboard" className="shrink-0">
            <Logo />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 max-w-[45vw]">
              <AccountSwitcher accountId={accountId} accountName={accountName} role={role} accounts={accounts} compact />
            </div>
            {showCredits && <span className={`tabular shrink-0 text-[13px] font-semibold ${low ? "text-neg-text" : "text-muted"}`}>{credits} left</span>}
            <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-ghost btn-sm shrink-0" aria-label="Sign out">
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
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold ${active ? "bg-brand-soft text-brand" : "text-muted"}`}
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
