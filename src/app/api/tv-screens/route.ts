import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { tvScreenCreateSchema } from "@/lib/validation/schemas";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

// Office TV screens (owners and admins). The secret link is made here, shown once, and only its hash is stored.
export const GET = secureRoute(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data, error } = await supabase
      .from("tv_screens")
      .select("id, name, survey_id, location_id, show_comments, created_at, last_seen_at, surveys(name), locations(name)")
      .eq("account_id", membership.accountId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
    return ok(
      (data ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        survey: ((s.surveys ?? null) as unknown as { name: string } | null)?.name ?? null,
        location: ((s.locations ?? null) as unknown as { name: string } | null)?.name ?? null,
        showComments: s.show_comments,
        createdAt: s.created_at,
        lastSeenAt: s.last_seen_at,
      })),
    );
  },
);

export const POST = secureRoute<undefined, undefined, z.infer<typeof tvScreenCreateSchema>>(
  { auth: "user", action: "survey:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body: tvScreenCreateSchema, maxBodyBytes: 512 },
  async ({ supabase, membership, user, body, ipHash }) => {
    const secret = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(secret).digest("hex");
    const { data, error } = await supabase.rpc("create_tv_screen", {
      p_account: membership.accountId,
      p_name: body.name,
      p_token_hash: tokenHash,
      p_survey: body.surveyId,
      p_location: body.locationId,
      p_show_comments: body.showComments,
    });
    if (error) throw dbError(error);
    const id = data as string;
    await audit({ accountId: membership.accountId, userId: user.id, action: "tv.created", targetType: "tv_screen", targetId: id, ipHash });
    return ok({ id, url: `${env().appOrigin}/tv/${id}.${secret}` }, 201);
  },
);
