// Structured data for search engines (schema.org JSON-LD). The data is built by our own code, never from
// raw HTML, and "<" is escaped so nothing inside can close the script tag. This is the one place outside
// the email snippet allowed to write raw HTML (see tests/unit/security-audit.test.ts).
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
