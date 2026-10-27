import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-20">
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">TapRate</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">One-click feedback inside the emails you already send.</h1>
      <p className="mt-5 text-lg text-[var(--muted)]">
        Add rating buttons to your email signature or helpdesk replies. Customers tap once, you see who is happy and who
        needs a call back, in real time.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/signup" className="btn btn-primary">
          Start free
        </Link>
        <Link href="/login" className="btn btn-secondary">
          Sign in
        </Link>
      </div>
    </main>
  );
}
