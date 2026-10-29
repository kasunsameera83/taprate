import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/blog/markdown";

// Draws a post from its Markdown text. Everything is plain React text (escaped); links are checked
// (https, our own pages, or #anchors) and outside links open safely.
function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((n, i) => {
        switch (n.t) {
          case "text":
            return <Fragment key={i}>{n.v}</Fragment>;
          case "b":
            return (
              <strong key={i} className="font-semibold text-ink">
                <Inlines c={n.c} />
              </strong>
            );
          case "i":
            return (
              <em key={i}>
                <Inlines c={n.c} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
                {n.v}
              </code>
            );
          case "a":
            return (
              <a key={i} href={n.href} className="link" {...(n.external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
                <Inlines c={n.c} />
              </a>
            );
        }
      })}
    </>
  );
}

export function PostBody({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);
  return (
    <div className="space-y-5 text-[17px] leading-[1.75] text-[#334155]">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h2":
            return (
              <h2 key={i} id={b.id} className="scroll-mt-24 pt-4 text-[26px] leading-tight text-ink sm:text-[30px]">
                <Inlines c={b.c} />
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} id={b.id} className="scroll-mt-24 pt-2 text-[21px] leading-snug text-ink">
                <Inlines c={b.c} />
              </h3>
            );
          case "p":
            return (
              <p key={i}>
                <Inlines c={b.c} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-2 pl-6 marker:text-brand">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines c={it} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-brand">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines c={it} />
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-brand bg-brand-soft/60 py-3 pl-5 pr-4 text-[18px] italic text-ink">
                <Inlines c={b.c} />
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="my-8 border-line" />;
        }
      })}
    </div>
  );
}
