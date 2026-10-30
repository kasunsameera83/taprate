import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { INDUSTRY_IDS } from "@/lib/industries";
import { audit } from "@/lib/audit";

const body = z.object({ industry: z.enum(INDUSTRY_IDS, { error: "Choose an industry" }).nullable() }).strict();

// The business's industry, and how its happy % compares with others in the same industry (last 90 days).
// The database returns only an average, and only when at least 5 other businesses can be compared.
export const GET = secureRoute(
  { auth: "user", action: "stats:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { data, error } = await supabase.rpc("industry_benchmark", { p_account: membership.accountId });
    if (error) throw dbError(error);
    const b = (data ?? {}) as { industry?: string | null; mine?: number | null; average?: number | null; enough?: boolean };
    return ok({ industry: b.industry ?? null, mine: b.mine ?? null, average: b.average ?? null, enough: Boolean(b.enough) });
  },
);

// Owner only (row rules on accounts).
export const PATCH = secureRoute<undefined, undefined, z.infer<typeof body>>(
  { auth: "user", action: "account:write", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, body, maxBodyBytes: 128 },
  async ({ supabase, membership, user, body: b, ipHash }) => {
    const { error } = await supabase.from("accounts").update({ industry: b.industry }).eq("id", membership.accountId);
    if (error) throw dbError(error);
    await audit({ accountId: membership.accountId, userId: user.id, action: "account.industry", metadata: { industry: b.industry ?? "none" }, ipHash });
    return ok({ industry: b.industry });
  },
);
