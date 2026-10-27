import Link from "next/link";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase/server";
import { LogoutButton } from "./LogoutButton";

// Server-side guard for the whole signed-in area (middleware also redirects; API routes check again).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const nav = [
    { href: "/app", label: "Dashboard" },
    { href: "/app/surveys", label: "Surveys" },
    { href: "/app/responses", label: "Responses" },
    { href: "/app/settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/app" className="font-bold">
            TapRate
          </Link>
          <nav className="flex flex-1 gap-4 overflow-x-auto text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap text-[var(--muted)] hover:text-[var(--ink)]">
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-sm text-[var(--muted)] sm:inline">{data.user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
