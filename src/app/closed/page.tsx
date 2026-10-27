import type { Metadata } from "next";

export const metadata: Metadata = { title: "Survey closed", robots: { index: false, follow: false } };

export default function ClosedPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">This survey is closed</h1>
      <p className="mt-3 text-[var(--muted)]">It isn't collecting responses right now. Thanks for taking the time to click.</p>
    </main>
  );
}
