import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-3 text-[var(--muted)]">This link may have expired or been mistyped.</p>
      <Link href="/" className="btn btn-secondary mt-6">
        Go home
      </Link>
    </main>
  );
}
