import type { Metadata } from "next";
import { Logo } from "@/components/icons";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { verifyPurposeToken } from "@/lib/security/signing";
import { UNSUB_SEND_PURPOSE, UNSUB_TTL_SECONDS } from "@/lib/sending/server";
import { StopEmailsButton } from "./StopEmailsButton";

export const metadata: Metadata = { title: "Stop survey emails", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Linked from the footer of every survey email TapRate sends for a business.
export default async function StopSurveyEmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const r = typeof sp.r === "string" && UUID.test(sp.r) ? sp.r : "";
  const t = typeof sp.t === "string" && sp.t.length <= 60 ? sp.t : "";
  let business: string | null = null;
  if (r && t && verifyPurposeToken(env().RESPONSE_TOKEN_SECRET, UNSUB_SEND_PURPOSE, r, t, UNSUB_TTL_SECONDS)) {
    const { data } = await adminClient().from("send_recipients").select("accounts(name)").eq("id", r).maybeSingle();
    business = ((data?.accounts ?? null) as unknown as { name: string } | null)?.name ?? null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="panel w-full max-w-md space-y-4 p-6 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        {business ? (
          <>
            <h1 className="text-xl font-bold">Stop survey emails from {business}?</h1>
            <p className="text-sm text-muted">You won&rsquo;t get any more feedback emails from {business} through TapRate. Other emails from them aren&rsquo;t affected.</p>
            <StopEmailsButton r={r} t={t} business={business} />
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">This link has expired</h1>
            <p className="text-sm text-muted">Reply to the survey email and ask the business to stop, or use the &ldquo;Unsubscribe&rdquo; button in your email app.</p>
          </>
        )}
      </div>
    </main>
  );
}
