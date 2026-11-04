import { requirePageSession } from "@/lib/session";
import { AppNav } from "./AppNav";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { PlanProvider } from "@/components/PlanContext";
import { NotificationsProvider } from "@/components/Notifications";
import { loadCatalog } from "@/lib/billing/catalogServer";
import { allowanceFor } from "@/lib/billing/credits";
import { CreditsBanner } from "./CreditsBanner";
import Link from "next/link";
import { fmtColomboDate, RENEW_REMINDER_DAYS } from "@/lib/billing/planEmails";

// Server-side guard for the whole signed-in area: verified session, 2FA step done, real membership.
// (Middleware also redirects, and every API route checks again.)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, memberships, active } = await requirePageSession({ needAccount: true });

  const isOwner = active!.role === "owner";
  const [{ data: account }, { data: adminStatus }, catalog, { data: prepaidSub }] = await Promise.all([
    supabase.from("accounts").select("name, plan, credit_balance, suspended_at, suspended_reason").eq("id", active!.accountId).maybeSingle(),
    supabase.rpc("platform_admin_status"),
    loadCatalog(),
    // Owners only (the database lets only owners read plans anyway): a prepaid plan that ends soon.
    isOwner
      ? supabase.from("subscriptions").select("plan, current_period_end").eq("account_id", active!.accountId).eq("prepaid", true).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const endsAt = prepaidSub?.current_period_end ? String(prepaidSub.current_period_end) : null;
  const endingSoon = endsAt !== null && Date.parse(endsAt) - Date.now() < RENEW_REMINDER_DAYS * 86400_000;
  const planName = catalog.plans.find((p) => p.id === prepaidSub?.plan)?.name ?? "paid";
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
          {endingSoon && endsAt && !account?.suspended_at && (
            <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-brand/30 bg-brand-soft p-4 text-sm">
              <p className="min-w-0 flex-1 text-ink">
                <strong>Your {planName} plan ends on {fmtColomboDate(endsAt)}.</strong> It doesn&rsquo;t renew by itself. Renew now and the new month is added on to the end.
              </p>
              <Link href="/app/settings/billing#plans" className="btn btn-primary btn-sm">
                Renew plan
              </Link>
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
