import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { readingMinutes } from "./markdown";

export type PublicPost = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  seoDescription: string | null;
  authorName: string;
  coverUrl: string | null;
  publishedAt: string;
  updatedAt: string;
  minutes: number;
};

const COVER_RE = /^posts\/[0-9a-f-]{36}\/cover-[A-Za-z0-9_-]{16,40}\.(png|jpg|webp)$/;

export function isCoverPath(p: unknown, postId?: string): p is string {
  return typeof p === "string" && COVER_RE.test(p) && (!postId || p.startsWith(`posts/${postId}/`));
}

/** Public URL of a post's cover picture (path re-checked so nothing odd reaches an <img src>). */
export function coverUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !isCoverPath(path)) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/blog-images/${path}`;
}

type Row = { slug: string; title: string; excerpt: string; body: string; seo_description: string | null; author_name: string; cover_path: string | null; published_at: string; updated_at: string };

const toPost = (r: Row): PublicPost => ({
  slug: r.slug,
  title: r.title,
  excerpt: r.excerpt,
  body: r.body,
  seoDescription: r.seo_description,
  authorName: r.author_name,
  coverUrl: coverUrl(r.cover_path),
  publishedAt: r.published_at,
  updatedAt: r.updated_at,
  minutes: readingMinutes(r.body),
});

const COLUMNS = "slug, title, excerpt, body, seo_description, author_name, cover_path, published_at, updated_at";

// Visitors only ever see PUBLISHED posts whose publish time has arrived (drafts and scheduled posts stay hidden).
export async function listPublishedPosts(limit = 50): Promise<PublicPost[]> {
  const { data } = await adminClient()
    .from("blog_posts")
    .select(COLUMNS)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Row[]).map(toPost);
}

export async function getPublishedPost(slug: string): Promise<PublicPost | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const { data } = await adminClient()
    .from("blog_posts")
    .select(COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  return data ? toPost(data as Row) : null;
}
