import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { isPushEndpoint, validKeys } from "@/lib/push/webpush";
import { env } from "@/lib/env";
import { pushConfigured } from "@/lib/push/server";

const subscribeSchema = z
  .object({
    endpoint: z.string().max(1000).refine(isPushEndpoint, "That browser's push service isn't supported"),
    keys: z.object({ p256dh: z.string().max(120), auth: z.string().max(40) }).strict(),
    device: z.string().max(80).optional(),
  })
  .strict()
  .refine((v) => validKeys(v.keys.p256dh, v.keys.auth), { message: "Invalid subscription keys", path: ["keys"] });

// This person's devices with alerts on, and the public key browsers need to subscribe.
export const GET = secureRoute(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership, user }) => {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, device, created_at, last_used_at")
      .eq("user_id", user.id)
      .eq("account_id", membership.accountId)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
    return ok({ configured: pushConfigured(), publicKey: env().VAPID_PUBLIC_KEY || null, devices: data ?? [] });
  },
);

// Turn alerts on for this device. The database checks you belong to this business.
export const POST = secureRoute<undefined, undefined, z.infer<typeof subscribeSchema>>(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: subscribeSchema, maxBodyBytes: 2048 },
  async ({ supabase, membership, body, requestId }) => {
    if (!pushConfigured()) return fail("unavailable", "Phone alerts aren't set up on this server yet.", undefined, requestId);
    const { data, error } = await supabase.rpc("save_push_subscription", {
      p_account: membership.accountId,
      p_endpoint: body.endpoint,
      p_p256dh: body.keys.p256dh,
      p_auth: body.keys.auth,
      p_device: (body.device ?? "").replace(/[<>\u0000-\u001f]/g, "").slice(0, 80) || null,
    });
    if (error) throw dbError(error);
    return ok({ id: data as string }, 201);
  },
);

const delQuery = z.object({ id: uuidSchema }).strict();

export const DELETE = secureRoute<undefined, z.infer<typeof delQuery>>(
  { auth: "user", action: "account:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, query: delQuery },
  async ({ supabase, query }) => {
    const { error } = await supabase.rpc("delete_push_subscription", { p_id: query.id });
    if (error) throw dbError(error);
    return ok({ removed: true });
  },
);
