import { COMPANY } from "@/lib/site/company";

// RFC 9116: tells security researchers how to report a problem responsibly.
export const dynamic = "force-static";

export function GET() {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const expires = new Date(Date.now() + 300 * 86_400_000).toISOString();
  const body = [`Contact: mailto:${COMPANY.securityEmail.replace(/[[\]]/g, "")}`, `Expires: ${expires}`, "Preferred-Languages: en", base ? `Canonical: ${base}/.well-known/security.txt` : "", base ? `Policy: ${base}/terms` : ""]
    .filter(Boolean)
    .join("\n");
  return new Response(`${body}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
