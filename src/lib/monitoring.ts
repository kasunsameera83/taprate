// Error monitoring. Every server error is logged as one JSON line (visible in Vercel's logs). If
// SENTRY_DSN is set, it's also sent to Sentry using Sentry's plain HTTP API (no SDK needed).
// Personal data is scrubbed first: no query strings, emails, tokens or long digit runs leave the server.
// Never throws.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRETISH = /\b(?:sk|pk|rk|whsec|tr|sk-ant)[-_][A-Za-z0-9_-]{8,}\b|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const LONG_NUMBER = /\d{7,}/g;

export function scrub(text: string): string {
  return text.replace(EMAIL, "[email]").replace(SECRETISH, "[secret]").replace(LONG_NUMBER, "[number]").slice(0, 2000);
}

/** Path only: query strings can carry emails and tokens (rating links do). */
export function safePath(pathOrUrl: string | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  const p = pathOrUrl.split("?")[0]!.split("#")[0]!;
  // Signed tokens in paths (/r/<token>, /k/<secret>, /s/<token>) are cut off too.
  return p.replace(/^\/(r|k|s|w|thanks)\/[^/]+/, "/$1/[token]").slice(0, 200);
}

export function parseDsn(dsn: string | undefined): { endpoint: string; key: string } | null {
  if (!dsn) return null;
  const m = /^https:\/\/([0-9a-f]{16,64})@([A-Za-z0-9.-]+)\/(\d{1,20})$/.exec(dsn.trim());
  if (!m) return null;
  return { key: m[1]!, endpoint: `https://${m[2]}/api/${m[3]}/envelope/` };
}

export type ErrorContext = { source: "server" | "client"; path?: string; method?: string; routeType?: string; digest?: string };

export async function reportError(err: unknown, ctx: ErrorContext): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: "error",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
      tags: { source: ctx.source, route_type: ctx.routeType ?? "unknown", method: ctx.method ?? "" },
      transaction: safePath(ctx.path),
      exception: {
        values: [
          {
            type: scrub(e.name || "Error").slice(0, 100),
            value: scrub(e.message || ""),
            stacktrace: e.stack
              ? {
                  frames: e.stack
                    .split("\n")
                    .slice(1, 30)
                    .reverse()
                    .map((line) => ({ function: scrub(line.trim()).slice(0, 300) })),
                }
              : undefined,
          },
        ],
      },
      extra: ctx.digest ? { digest: ctx.digest.slice(0, 100) } : undefined,
    };
    console.error(JSON.stringify({ level: "error", source: ctx.source, path: event.transaction, type: event.exception.values[0]!.type, message: event.exception.values[0]!.value, digest: ctx.digest }));

    const dsn = parseDsn(process.env.SENTRY_DSN);
    if (!dsn) return;
    const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=taprate/1.0` },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* monitoring must never break the app */
  }
}
