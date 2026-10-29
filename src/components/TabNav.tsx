"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId } from "react";

// Section tabs. On phones they become a dropdown (a long row of tabs that scrolls sideways is easy to
// miss); from small tablets up they're normal tabs.
export function TabNav({ label, tabs, exactRoot }: { label: string; tabs: Array<{ href: string; label: string }>; exactRoot?: string }) {
  const path = usePathname();
  const router = useRouter();
  const id = useId();
  const isActive = (href: string) => (href === exactRoot ? path === href : path === href || path.startsWith(`${href}/`));
  const current = [...tabs].reverse().find((t) => isActive(t.href)) ?? tabs[0];
  return (
    <>
      <div className="sm:hidden">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <select id={id} className="input" value={current?.href} onChange={(e) => router.push(e.target.value)}>
          {tabs.map((t) => (
            <option key={t.href} value={t.href}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {/* Scrolls sideways if the tabs don't fit, without showing a scroll bar. The grey line is drawn inside the
          row (inset shadow) so nothing sticks out and no stray up/down scroll bar appears. */}
      <nav
        aria-label={label}
        className="hidden gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const active = t.href === current?.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold ${active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
