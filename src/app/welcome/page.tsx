import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { listMemberships, mfaState } from "@/lib/account";
import { Logo } from "@/components/icons";
import { WelcomeClient } from "./WelcomeClient";

export const metadata: Metadata = { title: "Join your team", robots: { index: false, follow: false } };

// Landing page for invite emails, and for signed-in people who don't belong to a business yet.
export default async function WelcomePage() {
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return (
      <Shell>
        <h1 className="text-[28px] font-bold leading-tight">You&rsquo;ve been invited to TapTruly</h1>
        <p className="mt-2 text-muted">
          Sign in, or create an account, using the <strong className="text-ink">same email address the invite was sent to</strong>. Your invite will be
          waiting.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className="btn btn-primary">
            Create an account
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if ((await mfaState(supabase)).needsCode) redirect("/login/verify");
  const memberships = await listMemberships(supabase, data.user.id);

  return (
    <Shell>
      <WelcomeClient email={data.user.email ?? ""} hasAccounts={memberships.length > 0} ownsAccount={memberships.some((m) => m.role === "owner")} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-5 py-8">
      <Link href="/" aria-label="TapTruly home">
        <Logo />
      </Link>
      <main className="mx-auto mt-12 max-w-lg">{children}</main>
    </div>
  );
}
