import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/blog/server";

// Only the public marketing pages and published blog posts. Everything else is private (see robots.txt).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const now = new Date();
  let posts: Awaited<ReturnType<typeof listPublishedPosts>> = [];
  try {
    posts = await listPublishedPosts(500);
  } catch {
    // The sitemap still works if the database is unreachable.
  }
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog`, lastModified: posts[0] ? new Date(posts[0].publishedAt) : now, changeFrequency: "weekly", priority: 0.7 },
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${base}/switch-from-delighted`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
