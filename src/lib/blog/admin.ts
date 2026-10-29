import "server-only";
import type { BlogPostInput } from "./schema";
import { coverUrl } from "./server";

export const ADMIN_POST_COLUMNS = "id, slug, title, excerpt, body, seo_description, author_name, cover_path, status, published_at, created_at, updated_at";

type Row = { id: string; slug: string; title: string; excerpt: string; body: string; seo_description: string | null; author_name: string; cover_path: string | null; status: "draft" | "published"; published_at: string | null; created_at: string; updated_at: string };

export function toAdminPost(r: Row) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    body: r.body,
    seoDescription: r.seo_description,
    authorName: r.author_name,
    coverUrl: coverUrl(r.cover_path),
    status: r.status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Database columns from the checked form. Publishing without a date means "now". */
export function toColumns(b: BlogPostInput) {
  return {
    slug: b.slug,
    title: b.title,
    excerpt: b.excerpt,
    body: b.body,
    seo_description: b.seoDescription,
    author_name: b.authorName,
    status: b.status,
    published_at: b.status === "published" ? (b.publishedAt ?? new Date().toISOString()) : b.publishedAt,
    updated_at: new Date().toISOString(),
  };
}
