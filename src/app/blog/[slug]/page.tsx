import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterAuto } from "@/components/site/SiteFooterAuto";
import { PostBody } from "@/components/blog/PostBody";
import { getPublishedPost, listPublishedPosts } from "@/lib/blog/server";
import { JsonLd } from "@/components/JsonLd";
import { blogPosting, breadcrumbs, siteUrl } from "@/lib/site/structuredData";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug);
  if (!post) return { title: "Post not found", robots: { index: false, follow: false } };
  const description = post.seoDescription || post.excerpt || undefined;
  return {
    title: post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.authorName],
      ...(post.coverUrl ? { images: [{ url: post.coverUrl, width: 1200, height: 630 }] } : {}),
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });

export default async function BlogPost({ params }: Props) {
  const post = await getPublishedPost((await params).slug);
  if (!post) notFound();
  const more = (await listPublishedPosts(4)).filter((p) => p.slug !== post.slug).slice(0, 3);
  const site = siteUrl();
  return (
    <div className="min-h-screen">
      <JsonLd
        data={[
          blogPosting(site, { slug: post.slug, title: post.title, description: post.seoDescription || post.excerpt, authorName: post.authorName, publishedAt: post.publishedAt, updatedAt: post.updatedAt, image: post.coverUrl }),
          breadcrumbs(site, [
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <SiteHeader />
      <main id="main" className="pb-20 pt-8">
        <article>
          <header className="mx-auto max-w-3xl px-5">
            <Link href="/blog" className="text-sm font-semibold text-brand hover:underline">
              ← All posts
            </Link>
            <h1 className="mt-5 text-[36px] leading-[1.08] sm:text-[48px]">{post.title}</h1>
            {post.excerpt && <p className="mt-4 text-[19px] leading-relaxed text-muted">{post.excerpt}</p>}
            <p className="mt-5 text-sm text-muted">
              {post.authorName} · <time dateTime={post.publishedAt}>{fmt(post.publishedAt)}</time> · {post.minutes} min read
            </p>
          </header>
          {post.coverUrl && (
            <div className="mx-auto mt-8 max-w-4xl px-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverUrl} alt="" className="aspect-[1200/630] w-full rounded-[var(--radius-hero)] object-cover" />
            </div>
          )}
          <div className="mx-auto mt-10 max-w-3xl px-5">
            <PostBody markdown={post.body} />
          </div>
        </article>

        <aside className="mx-auto mt-16 max-w-3xl px-5">
          <div className="rounded-[var(--radius-hero)] bg-ink p-8 text-white sm:p-10">
            <h2 className="text-[26px] leading-tight sm:text-[30px]">Hear from every customer, starting today</h2>
            <p className="mt-3 text-[#cbd5e1]">One-tap ratings in your emails, QR codes and WhatsApp. 50 free responses, no card needed.</p>
            <Link href="/signup" className="btn mt-6 min-h-12 bg-white px-6 text-brand hover:bg-[#eef2ff]">
              Start free
            </Link>
          </div>
        </aside>

        {more.length > 0 && (
          <section aria-labelledby="more-posts" className="mx-auto mt-16 max-w-6xl px-5">
            <h2 id="more-posts" className="text-[24px]">More from the blog</h2>
            <ul className="mt-6 grid gap-6 sm:grid-cols-3">
              {more.map((p) => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="group block rounded-[var(--radius-panel)] border border-line bg-surface p-5 hover:shadow-[0_20px_40px_-30px_rgba(15,23,42,0.45)]">
                    <p className="text-[13px] text-muted">{fmt(p.publishedAt)}</p>
                    <h3 className="mt-2 text-[18px] leading-snug group-hover:text-brand">{p.title}</h3>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooterAuto />
    </div>
  );
}
