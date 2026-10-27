import type { Metadata } from "next";

export const metadata: Metadata = { title: "Survey closed", robots: { index: false, follow: false } };

export default function ClosedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="text-[26px] font-bold">This survey is closed</h1>
      <p className="mt-2 text-muted">It isn&rsquo;t collecting ratings right now, so your tap wasn&rsquo;t saved. Thanks for taking the time.</p>
    </main>
  );
}
