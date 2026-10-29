// A small, safe Markdown subset for blog posts. Parsed into plain data (never HTML), then drawn by React,
// which escapes all text. Pure, unit-tested.
//
//   ## Heading / ### Smaller heading      paragraphs (blank line between)
//   - item / * item                       1. numbered item
//   > quote                               ---  (divider)
//   **bold**  *italic*  `code`  [link text](https://… or /page or #section)

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; c: Inline[]; external: boolean };

export type Block =
  | { t: "h2" | "h3"; c: Inline[]; id: string }
  | { t: "p"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" };

const MAX_DEPTH = 4;

/** Only https links, links to our own pages (/x) and in-page anchors (#x). Everything else becomes text. */
export function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (v.length > 500 || /[\s<>"'`\\]/.test(v)) return null;
  if (v.startsWith("#")) return /^#[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null;
  if (v.startsWith("/")) return !v.startsWith("//") && /^\/[A-Za-z0-9/_?=&.#%-]*$/.test(v) ? v : null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/** Parses inline formatting. Unclosed markers are left as plain text. */
export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (depth < MAX_DEPTH) {
      if (rest.startsWith("`")) {
        const end = src.indexOf("`", i + 1);
        if (end > i + 1) {
          flush();
          out.push({ t: "code", v: src.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }
      if (rest.startsWith("**")) {
        const end = src.indexOf("**", i + 2);
        if (end > i + 2) {
          flush();
          out.push({ t: "b", c: parseInline(src.slice(i + 2, end), depth + 1) });
          i = end + 2;
          continue;
        }
      }
      if (rest.startsWith("*") && !rest.startsWith("**")) {
        const end = src.indexOf("*", i + 1);
        if (end > i + 1 && src[end + 1] !== "*") {
          flush();
          out.push({ t: "i", c: parseInline(src.slice(i + 1, end), depth + 1) });
          i = end + 1;
          continue;
        }
      }
      if (rest.startsWith("[")) {
        const m = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/.exec(rest);
        if (m) {
          const href = safeHref(m[2]!);
          flush();
          if (href) out.push({ t: "a", href, external: href.startsWith("https://"), c: parseInline(m[1]!, depth + 1) });
          else out.push({ t: "text", v: m[1]! });
          i += m[0].length;
          continue;
        }
      }
    }
    buf += src[i];
    i++;
  }
  flush();
  return out;
}

/** Plain text of some inline content (for heading ids, reading time, summaries). */
export function inlineText(c: Inline[]): string {
  return c.map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.c))).join("");
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").slice(0, 60000).split("\n");
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  const headingId = (text: string) => {
    const base = slugifyHeading(text) || "section";
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };
  let para: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      endPara();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{2,3})\s+(.+)$/.exec(trimmed))) {
      endPara();
      const c = parseInline(m[2]!.trim());
      blocks.push({ t: m[1]!.length === 2 ? "h2" : "h3", c, id: headingId(inlineText(c)) });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      endPara();
      blocks.push({ t: "hr" });
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      endPara();
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!.trim())) {
        q.push(lines[i]!.trim().replace(/^>\s?/, ""));
        i++;
      }
      i--;
      blocks.push({ t: "quote", c: parseInline(q.join(" ")) });
      continue;
    }
    const isUl = (s: string) => /^[-*]\s+/.test(s);
    const isOl = (s: string) => /^\d{1,3}[.)]\s+/.test(s);
    if (isUl(trimmed) || isOl(trimmed)) {
      endPara();
      const ordered = isOl(trimmed);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const s = lines[i]!.trim();
        if (ordered ? !isOl(s) : !isUl(s)) break;
        items.push(parseInline(s.replace(ordered ? /^\d{1,3}[.)]\s+/ : /^[-*]\s+/, "")));
        i++;
      }
      i--;
      blocks.push({ t: ordered ? "ol" : "ul", items: items.slice(0, 200) });
      continue;
    }
    para.push(trimmed);
  }
  endPara();
  return blocks;
}

/** About how long the post takes to read (200 words a minute, at least 1 minute). */
export function readingMinutes(src: string): number {
  const words = src.replace(/[#>*`\-[\]()]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
