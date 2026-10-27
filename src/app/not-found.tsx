import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="text-[26px] font-bold">Page not found</h1>
      <p className="mt-2 text-muted">The link may have expired or been mistyped.</p>
      <Link href="/" className="btn btn-secondary mt-6">
        Go to TapRate
      </Link>
    </main>
  );
}
