import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdminPage } from "@/lib/admin";
import { Logo } from "@/components/icons";
import { Notice } from "@/components/ui";
import { ConfirmHost } from "@/components/ConfirmDialog";
import { AdminTabs } from "./AdminTabs";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// The product owner's console. Server-side guard: signed in, listed as a platform admin, AND this
// session passed two-step verification. Everyone else gets a 404. Every API route checks again, and
// so does the database.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status, email } = await requirePlatformAdminPage();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-semibold text-white">Admin</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{email}</span>
            <Link href="/app" className="btn btn-ghost btn-sm">
              Back to app
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl space-y-6 px-5 pb-16 pt-6">
        {status === "needs_mfa" ? (
          <Notice kind="info">
            The admin area needs two-step verification. Turn it on in{" "}
            <Link href="/app/settings" className="link">
              Settings → Your account
            </Link>
            , then sign out and sign in again.
          </Notice>
        ) : (
          <>
            <AdminTabs />
            {children}
          </>
        )}
      </main>
      <ConfirmHost />
    </div>
  );
}
