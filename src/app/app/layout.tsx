import { requirePageSession } from "@/lib/session";
import { AppNav } from "./AppNav";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { PlanProvider } from "@/components/PlanContext";
import { NotificationsProvider } from "@/components/Notifications";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { allowanceFor } from "@/lib/billing/credits";
import { CreditsBanner } from "./CreditsBanner";

// Server-side guard for the whole signed-in area: verified session, 2FA step done, real membership.
// (Middleware also redirects, and every API route checks again.)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, memberships, active } = await requirePageSession({ needAccount: true });

  const [{ data: account }, { data: adminStatus }, catalog] = await Promise.all([
    supabase.from("accounts").select("name, plan, credit_balance, suspended_at, suspended_reason").eq("id", active!.accountId).maybeSingle(),
    supabase.rpc("platform_admin_status"),
    loadCatalog(),
  ]);
  const plan = account?.plan ?? "trial";
  const credits = account?.credit_balance ?? 0;
  const allowance = allowanceFor(plan, catalog);

  return (
    <NotificationsProvider>
    <div className="min-h-screen lg:flex">
      <AppNav
        isPlatformAdmin={adminStatus === "ok" || adminStatus === "needs_mfa"}
        email={user.email ?? ""}
        accountId={active!.accountId}
        accountName={account?.name ?? active!.accountName}
        role={active!.role}
        plan={plan}
        credits={credits}
        allowance={allowance}
        accounts={memberships.map((m) => ({ id: m.accountId, name: m.accountName, role: m.role }))}
      />
      <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
        <div className="mx-auto max-w-6xl">
          {account?.suspended_at && (
            <div role="alert" className="mb-6 rounded-[var(--radius-panel)] border border-[#f0c5c5] bg-neg-soft p-4 text-sm text-neg-text">
              <strong>This business is suspended</strong>, so it isn&rsquo;t collecting ratings right now. You can still see and export your data. Please contact
              TapTruly support.
            </div>
          )}
          {!account?.suspended_at && (active!.role === "owner" || active!.role === "admin") && (
            <CreditsBanner plan={plan} credits={credits} allowance={allowance} isOwner={active!.role === "owner"} />
          )}
          <PlanProvider plan={plan}>{children}</PlanProvider>
        </div>
      </main>
      <ConfirmHost />
    </div>
    </NotificationsProvider>
  );
}
