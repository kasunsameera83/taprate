"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, EmptyState, LoadError, Skeleton } from "@/components/ui";

type Post = { id: string; slug: string; title: string; status: "draft" | "published"; publishedAt: string | null; updatedAt: string };

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function state(p: Post): { label: string; tone: "pos" | "neu" | "plain" } {
  if (p.status === "draft") return { label: "Draft", tone: "plain" };
  if (p.publishedAt && Date.parse(p.publishedAt) > Date.now()) return { label: "Scheduled", tone: "neu" };
  return { label: "Published", tone: "pos" };
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    api<Post[]>("/api/admin/blog").then((r) => (r.ok ? setPosts(r.data) : setError(r.message)));
  }, []);
  useEffect(load, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!posts) return <Skeleton className="h-64 w-full rounded-[var(--radius-panel)]" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Blog</h1>
          <p className="text-sm text-muted">Posts appear at /blog once published. Drafts and scheduled posts stay hidden.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/blog" target="_blank" className="btn btn-secondary">
            View blog
          </Link>
          <Link href="/admin/blog/new" className="btn btn-primary">
            New post
          </Link>
        </div>
      </div>
      {posts.length === 0 ? (
        <div className="panel">
          <EmptyState title="No posts yet" body="Write your first post to start bringing people to TapTruly from search." action={<Link href="/admin/blog/new" className="btn btn-primary">New post</Link>} />
        </div>
      ) : (
        <ul className="panel divide-y divide-line">
          {posts.map((p) => {
            const s = state(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/blog/${p.id}`} className="font-semibold hover:text-brand">
                    {p.title}
                  </Link>
                  <p className="truncate text-[12px] text-muted">
                    /blog/{p.slug} · {p.status === "published" && p.publishedAt ? `goes live ${fmt(p.publishedAt)}` : `edited ${fmt(p.updatedAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <Link href={`/admin/blog/${p.id}`} className="btn btn-secondary btn-sm">
                    Edit
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
