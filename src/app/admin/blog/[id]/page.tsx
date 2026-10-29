"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { blogPostSchema, slugify } from "@/lib/blog/schema";
import { readingMinutes } from "@/lib/blog/markdown";
import { fieldErrors } from "@/lib/validation/schemas";
import { Field, LoadError, Notice, Segmented, Skeleton, TextInput } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsSection";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PostBody } from "@/components/blog/PostBody";

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  seoDescription: string | null;
  authorName: string;
  coverUrl: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
};
type Draft = Omit<Post, "id" | "coverUrl" | "seoDescription"> & { seoDescription: string };

const EMPTY: Draft = { slug: "", title: "", excerpt: "", body: "", seoDescription: "", authorName: "TapTruly team", status: "draft", publishedAt: null };

// <input type="datetime-local"> works in the computer's own time zone; we store ISO (UTC).
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const TOOLS: Array<{ label: string; title: string; wrap?: [string, string]; line?: string }> = [
  { label: "H2", title: "Section heading", line: "## " },
  { label: "H3", title: "Smaller heading", line: "### " },
  { label: "B", title: "Bold", wrap: ["**", "**"] },
  { label: "I", title: "Italic", wrap: ["*", "*"] },
  { label: "Link", title: "Link", wrap: ["[", "](https://)"] },
  { label: "• List", title: "Bullet list", line: "- " },
  { label: "1. List", title: "Numbered list", line: "1. " },
  { label: "“ Quote", title: "Quote", line: "> " },
];

export default function BlogEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === "new";
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const [cover, setCover] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isNew) return;
    api<Post>(`/api/admin/blog/${encodeURIComponent(id)}`).then((r) => {
      if (!r.ok) return setLoadError(r.message);
      const p = r.data;
      setDraft({ slug: p.slug, title: p.title, excerpt: p.excerpt, body: p.body, seoDescription: p.seoDescription ?? "", authorName: p.authorName, status: p.status, publishedAt: p.publishedAt });
      setCover(p.coverUrl);
    });
  }, [id, isNew]);

  if (loadError) return <LoadError message={loadError} onRetry={() => window.location.reload()} />;
  if (!draft) return <Skeleton className="h-96 w-full rounded-[var(--radius-panel)]" />;
  const d = draft;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...d, [k]: v });

  function applyTool(t: (typeof TOOLS)[number]) {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    let next: string;
    let caret: number;
    if (t.wrap) {
      const sel = value.slice(s, e) || (t.label === "Link" ? "link text" : "text");
      next = value.slice(0, s) + t.wrap[0] + sel + t.wrap[1] + value.slice(e);
      caret = s + t.wrap[0].length + sel.length + t.wrap[1].length;
    } else {
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      next = value.slice(0, lineStart) + t.line + value.slice(lineStart);
      caret = e + t.line!.length;
    }
    set("body", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  async function save(e: FormEvent<HTMLFormElement> | null, status: Draft["status"] = d.status) {
    e?.preventDefault();
    const input = { ...d, status, seoDescription: d.seoDescription, publishedAt: d.publishedAt ?? "" };
    const parsed = blogPostSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setMsg({ kind: "error", text: "Check the highlighted fields." });
      return;
    }
    setErrors({});
    setBusy(true);
    const r = isNew
      ? await api<{ id: string }>("/api/admin/blog", { method: "POST", body: parsed.data })
      : await api<{ saved: true }>(`/api/admin/blog/${encodeURIComponent(id)}`, { method: "PUT", body: parsed.data });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fields ?? {});
      setMsg({ kind: "error", text: r.message });
      return;
    }
    const future = parsed.data.publishedAt && Date.parse(parsed.data.publishedAt) > Date.now();
    setDraft({ ...d, status, publishedAt: status === "published" ? (parsed.data.publishedAt ?? new Date().toISOString()) : d.publishedAt });
    setMsg({ kind: "success", text: status === "draft" ? "Draft saved." : future ? "Scheduled. It goes live at the time you chose." : "Published. It's live on your blog." });
    if (isNew && "id" in r.data) router.replace(`/admin/blog/${r.data.id}`);
  }

  async function uploadCover(file: File) {
    if (file.size > 1024 * 1024) return setMsg({ kind: "error", text: "Cover pictures must be 1 MB or smaller." });
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setMsg({ kind: "error", text: "Use a PNG, JPG or WebP picture." });
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/blog/${encodeURIComponent(id)}/cover`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type }, body: new Uint8Array(await file.arrayBuffer()) });
      const json = (await res.json().catch(() => null)) as { ok: boolean; data?: { coverUrl: string }; error?: { message: string } } | null;
      if (res.ok && json?.ok && json.data) {
        setCover(json.data.coverUrl);
        setMsg({ kind: "success", text: "Cover picture saved." });
      } else setMsg({ kind: "error", text: json?.error?.message ?? "Upload failed. Please try again." });
    } catch {
      setMsg({ kind: "error", text: "Network problem. Check your connection and try again." });
    }
    setBusy(false);
  }

  async function removeCover() {
    setBusy(true);
    const r = await api(`/api/admin/blog/${encodeURIComponent(id)}/cover`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) setCover(null);
    else setMsg({ kind: "error", text: r.message });
  }

  async function remove() {
    if (!(await confirmDialog({ title: `Delete “${d.title || "this post"}”?`, body: "The post and its cover picture are deleted for good. Links to it will show “page not found”.", confirmLabel: "Delete post", danger: true }))) return;
    setBusy(true);
    const r = await api(`/api/admin/blog/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    if (r.ok) router.replace("/admin/blog");
    else setMsg({ kind: "error", text: r.message });
  }

  const live = d.status === "published";
  return (
    <form onSubmit={(e) => save(e)} noValidate className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/blog" className="text-sm font-semibold text-brand hover:underline">
          ← All posts
        </Link>
        <div className="flex flex-wrap gap-2">
          {!isNew && live && (
            <Link href={`/blog/${d.slug}`} target="_blank" className="btn btn-secondary">
              View post
            </Link>
          )}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => save(null, "draft")}>
            {live ? "Unpublish (back to draft)" : "Save draft"}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save(null, "published")}>
            {live ? "Update post" : d.publishedAt && Date.parse(d.publishedAt) > Date.now() ? "Schedule" : "Publish"}
          </button>
        </div>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <SettingsSection title={isNew ? "New post" : "Edit post"}>
            <div className="space-y-4">
              <Field label="Title" name="title" error={errors.title}>
                <TextInput
                  name="title"
                  maxLength={120}
                  value={d.title}
                  error={errors.title}
                  onChange={(e) => setDraft({ ...d, title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                />
              </Field>
              <Field label="Summary" name="excerpt" optional error={errors.excerpt} hint={`Shown under the title and in the post list. ${d.excerpt.length}/300`}>
                <textarea id="excerpt" name="excerpt" className="input min-h-20" maxLength={300} value={d.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
              </Field>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Segmented<"write" | "preview">
                    label="Editor view"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { value: "write", label: "Write" },
                      { value: "preview", label: "Preview" },
                    ]}
                  />
                  <span className="text-[12px] text-muted">
                    {d.body.length.toLocaleString()} characters · about {readingMinutes(d.body)} min read
                  </span>
                </div>
                {tab === "write" ? (
                  <>
                    <div className="mb-2 flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
                      {TOOLS.map((t) => (
                        <button key={t.label} type="button" title={t.title} className="btn btn-ghost btn-sm min-h-8 px-2.5" onClick={() => applyTool(t)}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <label htmlFor="body" className="sr-only">
                      Post text
                    </label>
                    <textarea
                      ref={bodyRef}
                      id="body"
                      name="body"
                      className="input min-h-[480px] font-mono text-[14px] leading-relaxed"
                      maxLength={60000}
                      value={d.body}
                      onChange={(e) => set("body", e.target.value)}
                      aria-invalid={errors.body ? true : undefined}
                    />
                    <p className="mt-1 text-[12px] text-muted">
                      ## heading · ### smaller heading · **bold** · *italic* · [link](https://…) · - list · 1. list · &gt; quote · --- divider. Leave a blank line between paragraphs.
                    </p>
                    {errors.body && <p className="mt-1 text-[13px] text-neg-text">{errors.body}</p>}
                  </>
                ) : (
                  <div className="rounded-[12px] border border-line bg-surface p-5 sm:p-8">
                    <h1 className="text-[32px] leading-tight">{d.title || "Your title"}</h1>
                    {d.excerpt && <p className="mt-3 text-[18px] text-muted">{d.excerpt}</p>}
                    <div className="mt-6">{d.body.trim() ? <PostBody markdown={d.body} /> : <p className="text-muted">Nothing written yet.</p>}</div>
                  </div>
                )}
              </div>
            </div>
          </SettingsSection>
        </div>

        <div className="space-y-4">
          <SettingsSection title="Publishing">
            <div className="space-y-4">
              <p className="text-sm">
                Status: <strong>{live ? (d.publishedAt && Date.parse(d.publishedAt) > Date.now() ? "Scheduled" : "Published") : "Draft"}</strong>
              </p>
              <Field label="Go live at" name="publishedAt" optional error={errors.publishedAt} hint="Leave empty to go live when you press Publish. A future time schedules it.">
                <input id="publishedAt" type="datetime-local" className="input" value={toLocal(d.publishedAt)} onChange={(e) => set("publishedAt", fromLocal(e.target.value))} />
              </Field>
              <Field label="Web address" name="slug" error={errors.slug} hint={`taptruly.com/blog/${d.slug || "…"}`}>
                <TextInput
                  name="slug"
                  maxLength={80}
                  value={d.slug}
                  error={errors.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value.toLowerCase());
                  }}
                />
              </Field>
              {live && <p className="text-[12px] text-muted">Changing the web address of a published post breaks links people already shared.</p>}
              <Field label="Author" name="authorName" error={errors.authorName}>
                <TextInput name="authorName" maxLength={60} value={d.authorName} error={errors.authorName} onChange={(e) => set("authorName", e.target.value)} />
              </Field>
            </div>
          </SettingsSection>

          <SettingsSection title="Search and sharing">
            <Field label="Search description" name="seoDescription" optional error={errors.seoDescription} hint={`What Google shows under the title. Uses the summary if empty. ${d.seoDescription.length}/160`}>
              <textarea id="seoDescription" name="seoDescription" className="input min-h-20" maxLength={160} value={d.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} />
            </Field>
          </SettingsSection>

          <SettingsSection title="Cover picture">
            {isNew ? (
              <p className="text-sm text-muted">Save the draft first, then add a cover picture.</p>
            ) : (
              <div className="space-y-3">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="Cover preview" className="aspect-[1200/630] w-full rounded-[10px] border border-line object-cover" />
                ) : (
                  <p className="text-sm text-muted">No cover yet. Posts without one show a branded title card.</p>
                )}
                <label className="btn btn-secondary btn-sm cursor-pointer">
                  {cover ? "Replace picture" : "Upload picture"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadCover(f);
                    }}
                  />
                </label>
                {cover && (
                  <button type="button" className="btn btn-ghost btn-sm ml-2" disabled={busy} onClick={removeCover}>
                    Remove
                  </button>
                )}
                <p className="text-[12px] text-muted">1200 × 630 works best (also used when shared on social media). PNG, JPG or WebP, up to 1 MB.</p>
              </div>
            )}
          </SettingsSection>

          {!isNew && (
            <button type="button" className="btn btn-danger w-full" disabled={busy} onClick={remove}>
              Delete post
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
