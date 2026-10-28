import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { accountCreateSchema } from "@/lib/validation/schemas";
import { ACCOUNT_COOKIE, accountCookieOptions } from "@/lib/account";
import { audit } from "@/lib/audit";
import { adminClient } from "@/lib/supabase/server";
import { visitorCountry } from "@/lib/site/geo";

// Create your own business account (for people who joined through an invite). One owned account each,
// enforced in the database.
export const POST = secureRoute<undefined, undefined, z.infer<typeof accountCreateSchema>, "user-any">(
  { auth: "user-any", action: null, ipLimit: LIMITS.userWrite, userLimit: LIMITS.dangerous, body: accountCreateSchema, maxBodyBytes: 1024 },
  async ({ supabase, user, body, ipHash }) => {
    const { data, error } = await supabase.rpc("create_account", { p_name: body.name });
    if (error) throw dbError(error);
    const accountId = data as string;
    // Sinhala and Tamil for businesses created from Sri Lanka (the country comes from our host, not the browser).
    if ((await visitorCountry()) === "LK") await adminClient().rpc("enable_local_languages", { p_account: accountId });
    await audit({ accountId, userId: user.id, action: "account.create", ipHash });
    const res = ok({ accountId }, 201);
    res.cookies.set(ACCOUNT_COOKIE, accountId, accountCookieOptions);
    return res;
  },
);
