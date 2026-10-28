import { z } from "zod";
import { secureRoute, ok } from "@/lib/security/route";
import { reportError } from "@/lib/monitoring";

const body = z
  .object({
    message: z.string().max(500),
    digest: z.string().max(100).optional(),
    path: z.string().max(300).optional(),
  })
  .strict();

// Errors that happened in a visitor's browser (the error pages call this). Same-origin only, small,
// tightly rate limited, and scrubbed before it's logged.
export const POST = secureRoute<undefined, undefined, z.infer<typeof body>, "public">(
  { auth: "public", action: null, ipLimit: { name: "client-error:ip", limit: 10, windowSec: 600 }, body, maxBodyBytes: 1024 },
  async ({ body: b }) => {
    const err = new Error(b.message);
    err.name = "ClientError";
    await reportError(err, { source: "client", path: b.path, digest: b.digest });
    return ok({ received: true });
  },
);
