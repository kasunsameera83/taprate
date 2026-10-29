import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterAuto } from "@/components/site/SiteFooterAuto";
import { listPublishedPosts } from "@/lib/blog/server";

export const metadata: Metadata = {
  title: "Blog",
  description: "Ideas and practical guides for hearing from every customer: one-tap feedback, follow-ups and winning unhappy customers back.",
  alternates: { canonical: "/blog" },
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });

export default async function BlogIndex() {
  const posts = await listPublishedPosts();
  const [first, ...rest] = posts;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-5 pb-20 pt-10">
        <header className="max-w-2xl">
          <p className="text-sm font-semibold text-brand">TapTruly blog</p>
          <h1 className="mt-2 text-[40px] leading-[1.05] sm:text-[52px]">Hear from every customer</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted">Practical ideas for collecting honest feedback, fixing what went wrong, and turning unhappy customers into loyal ones.</p>
        </header>

        {posts.length === 0 ? (
          <p className="mt-12 text-muted">The first posts are on their way. Check back soon.</p>
        ) : (
          <>
            {first && (
              <Link href={`/blog/${first.slug}`} className="group mt-12 grid overflow-hidden rounded-[var(--radius-hero)] border border-line bg-surface transition-shadow hover:shadow-[0_24px_48px_-32px_rgba(15,23,42,0.45)] md:grid-cols-2">
                <Cover url={first.coverUrl} title={first.title} big />
                <div className="flex flex-col justify-center p-6 sm:p-10">
                  <Meta date={first.publishedAt} minutes={first.minutes} />
                  <h2 className="mt-3 text-[28px] leading-tight group-hover:text-brand sm:text-[34px]">{first.title}</h2>
                  {first.excerpt && <p className="mt-3 text-[16px] leading-relaxed text-muted">{first.excerpt}</p>}
                  <span className="mt-5 text-sm font-semibold text-brand">Read the post →</span>
                </div>
              </Link>
            )}
            {rest.length > 0 && (
              <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-shadow hover:shadow-[0_20px_40px_-30px_rgba(15,23,42,0.45)]">
                      <Cover url={p.coverUrl} title={p.title} />
                      <div className="flex flex-1 flex-col p-5">
                        <Meta date={p.publishedAt} minutes={p.minutes} />
                        <h2 className="mt-2 text-[20px] leading-snug group-hover:text-brand">{p.title}</h2>
                        {p.excerpt && <p className="mt-2 line-clamp-3 text-[15px] text-muted">{p.excerpt}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      <SiteFooterAuto />
    </div>
  );
}

function Meta({ date, minutes }: { date: string; minutes: number }) {
  return (
    <p className="text-[13px] text-muted">
      <time dateTime={date}>{fmt(date)}</time> · {minutes} min read
    </p>
  );
}

/** The post's picture, or a branded pattern when it has none. */
function Cover({ url, title, big = false }: { url: string | null; title: string; big?: boolean }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`w-full object-cover ${big ? "h-full min-h-60" : "aspect-[1200/630]"}`} loading="lazy" />
  ) : (
    <div aria-hidden className={`relative flex items-center justify-center overflow-hidden bg-[linear-gradient(135deg,var(--color-brand-from),var(--color-brand-to))] ${big ? "min-h-60" : "aspect-[1200/630]"}`}>
      <span className="px-6 text-center font-display text-[22px] leading-tight text-white/90 sm:text-[26px]">{title}</span>
    </div>
  );
}
