import Link from "next/link";
import { Logo, IconShield } from "@/components/icons";
import { HeroDemo } from "./HeroDemo";

const STEPS = [
  { title: "Write one question", body: "“How did we do?” Pick faces, stars, thumbs or a 0–10 score." },
  { title: "Paste the buttons", body: "Into your Gmail or Outlook signature, or your Zendesk, Freshdesk or HubSpot replies." },
  { title: "Customers tap once", body: "No survey link, no form. The tap is the answer, and it shows up on your dashboard." },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Start free
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:pt-16">
          <div>
            <h1 className="text-[40px] font-bold leading-[1.05] sm:text-[56px]">Know how every customer felt about every email.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Add rating buttons to the emails your team already sends. Customers tap once; you see who&rsquo;s happy and who needs a call back, the moment it
              happens.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn btn-primary min-h-12 px-6 text-base">
                Start free
              </Link>
              <Link href="/login" className="btn btn-secondary min-h-12 px-6 text-base">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">50 free responses. No card needed.</p>
          </div>
          <HeroDemo />
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-[28px] font-bold">Set up in five minutes</h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand">{i + 1}</span>
                  <div>
                    <h3 className="font-sans text-base font-semibold tracking-normal">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="flex flex-col gap-4 rounded-[var(--radius-hero)] border border-line bg-surface p-6 sm:flex-row sm:items-start sm:p-8">
            <IconShield className="h-8 w-8 shrink-0 text-brand" />
            <div>
              <h2 className="text-xl font-bold">Only real customers are counted</h2>
              <p className="mt-2 max-w-3xl text-muted">
                Corporate email scanners open every link in an email, which fills other tools with fake ratings. TapRate holds each click until a real browser
                confirms it, so scanners are never counted and never use up your responses. Every link is signed, and your data is kept separate from every other
                business.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
          <Logo />
          <span>&copy; {new Date().getFullYear()} TapRate</span>
        </div>
      </footer>
    </div>
  );
}
