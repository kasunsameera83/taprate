import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineText, parseInline, parseMarkdown, readingMinutes, safeHref } from "../../src/lib/blog/markdown.ts";
import { blogPostSchema, slugify } from "../../src/lib/blog/schema.ts";

test("markdown: headings, lists, quotes, dividers and paragraphs", () => {
  const b = parseMarkdown("## Why it works\n\nOne **tap** is *easy*.\nSecond line.\n\n- a\n- b\n\n1. one\n2. two\n\n> quoted\n> more\n\n---\n### Small");
  assert.deepEqual(b.map((x) => x.t), ["h2", "p", "ul", "ol", "quote", "hr", "h3"]);
  assert.equal(b[0]!.t === "h2" && b[0]!.id, "why-it-works");
  assert.equal(b[1]!.t === "p" && inlineText(b[1]!.c), "One tap is easy. Second line.");
  assert.equal(b[2]!.t === "ul" && b[2]!.items.length, 2);
  assert.equal(b[4]!.t === "quote" && inlineText(b[4]!.c), "quoted more");
});

test("markdown: duplicate headings get unique ids", () => {
  const b = parseMarkdown("## Tips\n## Tips");
  assert.deepEqual(b.map((x) => (x.t === "h2" ? x.id : "")), ["tips", "tips-2"]);
});

test("markdown: HTML is never produced, it stays as text", () => {
  const b = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
  assert.equal(b.length, 2);
  assert.equal(b[0]!.t === "p" && inlineText(b[0]!.c), "<script>alert(1)</script>");
});

test("links: only https, own pages and anchors; anything else becomes plain text", () => {
  for (const ok of ["https://taptruly.com/x", "/signup", "/blog/a-b?x=1", "#section"]) assert.ok(safeHref(ok), ok);
  for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "http://x.com", "//evil.com", "https://user:pw@x.com", "vbscript:x", "/x\"onmouseover=1", "#a b", "mailto:x@y.z"]) assert.equal(safeHref(bad), null, bad);
  const c = parseInline("[click](javascript:alert(1)) and [ok](https://example.com)");
  assert.equal(c[0]!.t, "text");
  assert.equal(c[0]!.t === "text" && c[0]!.v, "click");
  const link = c.find((n) => n.t === "a");
  assert.ok(link && link.t === "a" && link.href === "https://example.com/" && link.external);
});

test("inline: bold, italic, code; unclosed markers stay as text", () => {
  const c = parseInline("a **b** *c* `d` **open");
  assert.deepEqual(c.map((n) => n.t), ["text", "b", "text", "i", "text", "code", "text"]);
  assert.equal(inlineText(c), "a b c d **open");
});

test("reading time and slugs", () => {
  assert.equal(readingMinutes("word ".repeat(10)), 1);
  assert.equal(readingMinutes("word ".repeat(1000)), 5);
  assert.equal(slugify("Why one tap beats ten questions!"), "why-one-tap-beats-ten-questions");
  assert.equal(slugify("  Café — déjà vu  "), "cafe-deja-vu");
});

test("post rules: checked fields, safe slug, dates", () => {
  const ok = { title: "Hello there", slug: "hello-there", excerpt: "", body: "## Hi", seoDescription: "", authorName: "TapTruly team", status: "draft", publishedAt: "" };
  const r = blogPostSchema.safeParse(ok);
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.seoDescription, null);
  assert.equal(r.success && r.data.publishedAt, null);
  const lower = blogPostSchema.safeParse({ ...ok, slug: "Hello-There" });
  assert.equal(lower.success && lower.data.slug, "hello-there", "lowercased");
  for (const slug of ["hello there", "../x", "-x", "x-", "a", "x".repeat(81), "héllo"]) assert.equal(blogPostSchema.safeParse({ ...ok, slug }).success, false, slug);
  assert.equal(blogPostSchema.safeParse({ ...ok, status: "deleted" }).success, false);
  assert.equal(blogPostSchema.safeParse({ ...ok, publishedAt: "tomorrow" }).success, false);
  assert.equal(blogPostSchema.safeParse({ ...ok, publishedAt: "2026-11-01T09:00:00.000Z" }).success, true);
  assert.equal(blogPostSchema.safeParse({ ...ok, body: "x".repeat(60001) }).success, false);
  assert.equal(blogPostSchema.safeParse({ ...ok, extra: 1 }).success, false);
  const cleaned = blogPostSchema.safeParse({ ...ok, body: "a\u0000b\r\nc" });
  assert.equal(cleaned.success && cleaned.data.body, "ab\nc");
});
