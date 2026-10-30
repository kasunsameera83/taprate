// Automated security checks over the source code, run with every test run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath handles Windows drive letters and spaces in folder names.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");

// Routes that can't use the standard wrappers, and the checks each one must contain instead.
const SPECIAL: Record<string, RegExp[]> = {
  "src/app/api/webhooks/payhere/route.ts": [/verifyPayhereNotify\(/, /hitRateLimit\(/, /MAX_BYTES/],
  "src/app/api/webhooks/stripe/route.ts": [/verifyStripeSignature\(/, /hitRateLimit\(/, /MAX_BYTES/],
  "src/app/api/health/route.ts": [/hitRateLimit\(/],
  "src/app/api/webhooks/resend/route.ts": [/verifySvixSignature\(/, /hitRateLimit\(/, /MAX_BYTES/],
  "src/app/api/public/unsubscribe/one-click/route.ts": [/verifyPurposeToken\(/, /hitRateLimit\(/, /MAX_BYTES/],
  "src/app/api/webhooks/shopify/[id]/route.ts": [/verifyShopifyHmac\(/, /hitRateLimit\(/, /MAX_BYTES/, /isUuid\(id\)/, /x-shopify-shop-domain/],
};

test("every API route goes through a security wrapper (or has its own checks)", () => {
  const routes = files.filter((f) => rel(f).startsWith("src/app/api/") && f.endsWith("route.ts"));
  assert.ok(routes.length > 40, "found the API routes");
  for (const f of routes) {
    const r = rel(f);
    const src = readFileSync(f, "utf8");
    if (r.startsWith("src/app/api/cron/")) {
      assert.match(src, /timingSafeEqual/, `${r}: cron secret compared in constant time`);
      assert.match(src, /authorized\(req, e\.CRON_SECRET\)/, `${r}: cron secret required`);
      assert.match(src, /hitRateLimit\(/, `${r}: rate limited`);
      continue;
    }
    if (SPECIAL[r]) {
      for (const re of SPECIAL[r]!) assert.match(src, re, `${r}: missing ${re}`);
      continue;
    }
    for (const m of src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*([A-Za-z_]\w*)/g)) {
      assert.ok(m[2] === "secureRoute" || m[2] === "apiRoute", `${r}: ${m[1]} must use secureRoute or apiRoute`);
    }
    assert.doesNotMatch(src, /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/, `${r}: raw handler without a wrapper`);
  }
});

test("route files only export what Next.js allows", () => {
  const allowed = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "dynamic", "maxDuration", "runtime", "revalidate", "fetchCache", "preferredRegion"]);
  for (const f of files.filter((x) => rel(x).startsWith("src/app/") && x.endsWith("route.ts"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|function|let)\s+([A-Za-z_]\w*)/g)) {
      assert.ok(allowed.has(m[1]!), `${rel(f)} exports "${m[1]}"`);
    }
  }
});

test("browser code never imports server secrets", () => {
  const serverOnly = [/@\/lib\/supabase\/server/, /@\/lib\/env"/, /@\/lib\/admin"/, /@\/lib\/billing\/server/, /@\/lib\/insights\/(data|generate)/, /@\/lib\/email/, /@\/lib\/sending\/server/, /@\/lib\/insights\/wins"/];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (!/^["']use client["'];?/m.test(src.slice(0, 200))) continue;
    for (const re of serverOnly) assert.doesNotMatch(src, new RegExp(`from\\s+["']${re.source.replace(/"$/, "")}`), `${rel(f)} imports server-only code (${re})`);
    assert.doesNotMatch(src, /SERVICE_ROLE|SECRET_KEY|process\.env\.(?!NEXT_PUBLIC_)/, `${rel(f)} touches a server secret`);
  }
});

// The one allowed exception: the email-button preview, which shows HTML our own server built with every
// value escaped (src/lib/surveys/snippet.ts), with clicks disabled.
// SnippetPanel previews the email HTML we build; JsonLd writes escaped schema.org JSON (no user HTML).
const RAW_HTML_ALLOWED = new Set(["src/app/app/surveys/[id]/SnippetPanel.tsx", "src/components/JsonLd.tsx"]);

test("no HTML injection points and no eval", () => {
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (!RAW_HTML_ALLOWED.has(rel(f))) assert.doesNotMatch(src, /dangerouslySetInnerHTML/, `${rel(f)} uses dangerouslySetInnerHTML`);
    assert.doesNotMatch(src, /\beval\(|new Function\(/, `${rel(f)} uses eval`);
  }
});

test("service-role database access in API routes is always scoped", () => {
  // Wherever the service client reads or changes a table that belongs to a business, the same statement
  // must filter by account (or by an id that was itself loaded with an account filter).
  for (const f of files.filter((x) => rel(x).startsWith("src/app/api/") && !rel(x).startsWith("src/app/api/cron/") && !rel(x).startsWith("src/app/api/webhooks/"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/adminClient\(\)\s*\.from\("(\w+)"\)([\s\S]{0,400}?);/g)) {
      const table = m[1]!;
      const stmt = m[2]!;
      if (["billing_catalog", "platform_settings", "platform_audit_log", "audit_log"].includes(table)) continue;
      if (/\.insert\(\{[^}]*account_id/.test(stmt) || /\.upsert\(\{[^}]*account_id/.test(stmt)) continue;
      const scoped = /account_id/.test(stmt) || (table === "accounts" && /\.eq\("id", (accountId|membership\.accountId)\)/.test(stmt)) || /\.eq\("id", b\.s\)/.test(stmt);
      assert.ok(scoped, `${rel(f)}: service-role query on "${table}" without an account filter`);
    }
  }
});
