import { requirePageSession } from "@/lib/session";
import { AppNav } from "./AppNav";
import { ConfirmHost } from "@/components/ConfirmDialog";

// Server-side guard for the whole signed-in area: verified session, 2FA step done, real membership.
// (Middleware also redirects, and every API route checks again.)
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, memberships, active } = await requirePageSession({ needAccount: true });

  const { data: account } = await supabase.from("accounts").select("name, plan, credit_balance").eq("id", active!.accountId).maybeSingle();

  return (
    <div className="min-h-screen lg:flex">
      <AppNav
        email={user.email ?? ""}
        accountId={active!.accountId}
        accountName={account?.name ?? active!.accountName}
        role={active!.role}
        plan={account?.plan ?? "trial"}
        credits={account?.credit_balance ?? 0}
        accounts={memberships.map((m) => ({ id: m.accountId, name: m.accountName, role: m.role }))}
      />
      <main id="main" className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <ConfirmHost />
    </div>
  );
}
