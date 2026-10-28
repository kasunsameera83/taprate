// Next.js calls onRequestError for every uncaught server error (pages, API routes, server actions).
import { reportError } from "@/lib/monitoring";

export async function register() {}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routeType: string },
): Promise<void> {
  await reportError(err, { source: "server", path: request.path, method: request.method, routeType: context.routeType, digest: (err as { digest?: string })?.digest });
}
