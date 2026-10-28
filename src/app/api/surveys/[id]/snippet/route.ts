import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { snippetQuerySchema, uuidSchema } from "@/lib/validation/schemas";
import { buildSnippetHtml, buildClickUrl, MERGE_PRESETS, type MergeTags } from "@/lib/surveys/snippet";
import { buildLinkToken } from "@/lib/security/signing";
import { ICON_SETS, type IconSetId } from "@/lib/surveys/iconSets";
import { env } from "@/lib/env";
import { iconUrlMap, labelsFor, resolveOptions } from "@/lib/surveys/customIcons";
import { isLang } from "@/lib/i18n/public";

const params = z.object({ id: uuidSchema }).strict();

// Signing happens only here, on the server: the secret never reaches the browser.
export const GET = secureRoute<z.infer<typeof params>, z.infer<typeof snippetQuerySchema>>(
  { auth: "user", action: "survey:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params, query: snippetQuerySchema },
  async ({ supabase, membership, params, query }) => {
    const { data, error } = await supabase
      .from("surveys")
      .select("id, question, icon_set, brand_color, status, icon_images, option_labels, language")
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) return fail("not_found");

    const tags: MergeTags =
      query.preset === "custom"
        ? { email: query.email ?? "", agent: query.agent ?? "", ticket: query.ticket ?? "" }
        : { email: MERGE_PRESETS[query.preset].email, agent: MERGE_PRESETS[query.preset].agent, ticket: MERGE_PRESETS[query.preset].ticket };

    const e = env();
    const sign = (surveyId: string, rating: number) => buildLinkToken(e.LINK_SIGNING_SECRET, surveyId, rating);
    const iconSet = data.icon_set as IconSetId;
    const lang = isLang(data.language) ? data.language : "en";
    const options = resolveOptions(iconSet, { images: iconUrlMap(iconSet, data.icon_images), labels: labelsFor(iconSet, data.option_labels) }, lang);

    const html = buildSnippetHtml({
      appUrl: e.appOrigin,
      surveyId: data.id,
      iconSet,
      question: data.question,
      brandColor: data.brand_color,
      mergeTags: tags,
      signToken: sign,
      options,
      lang,
    });
    const links = options.map((o) => ({
      rating: o.value,
      label: o.label,
      url: buildClickUrl(e.appOrigin, sign(data.id, o.value), tags),
    }));

    return ok({ html, links, active: data.status === "active" });
  },
);
