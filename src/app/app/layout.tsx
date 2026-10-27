import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { AppNav } from "./AppNav";

// Server-side guard for the whole signed-in area (middleware also redirects; every API route checks again).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  // Read through RLS as the user: only their own membership/account can come back.
  const { data: m } = await supabase
    .from("memberships")
    .select("role, accounts(name, plan, credit_balance)")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const account = (m?.accounts ?? null) as unknown as { name: string; plan: string; credit_balance: number } | null;

  return (
    <div className="min-h-screen lg:flex">
      <AppNav
        email={data.user.email ?? ""}
        accountName={account?.name ?? "Your business"}
        plan={account?.plan ?? "trial"}
        credits={account?.credit_balance ?? 0}
      />
      <main id="main" className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
