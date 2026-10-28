import type { Metadata } from "next";
import { UnsubscribeButton } from "./UnsubscribeButton";
import { Logo } from "@/components/icons";

export const metadata: Metadata = { title: "Stop report emails", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = typeof sp.s === "string" ? sp.s : "";
  const t = typeof sp.t === "string" ? sp.t : "";
  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="panel w-full max-w-md space-y-4 p-6 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="text-xl font-bold">Stop report emails?</h1>
        <p className="text-sm text-muted">You&rsquo;ll stop getting these feedback reports. You can turn them back on any time in TapRate.</p>
        <UnsubscribeButton s={s} t={t} />
      </div>
    </main>
  );
}
