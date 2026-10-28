// Builds the copy-paste HTML that goes into emails and signatures. Pure, unit-tested.
// Buttons are styled text links (no images), so they show even when a mail client blocks images.
import { ICON_SETS, type IconSetId } from "./iconSets.ts";
import { escapeHtml } from "../security/html.ts";
import type { ResolvedOption } from "./customIcons.ts";

// Custom pictures must be our own public storage files (https, survey-icons bucket).
const ICON_URL_RE = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/storage\/v1\/object\/public\/survey-icons\/accounts\/[0-9a-f-]{36}\/surveys\/[0-9a-f-]{36}\/icon-\d{1,2}-[A-Za-z0-9_-]{16,40}\.(png|jpg|webp)$/;

export const MERGE_PRESETS = {
  signature: { label: "Email signature (Gmail / Outlook)", email: "", agent: "", ticket: "" },
  zendesk: { label: "Zendesk", email: "{{ticket.requester.email}}", agent: "{{ticket.assignee.name}}", ticket: "{{ticket.id}}" },
  freshdesk: { label: "Freshdesk", email: "{{ticket.contact.email}}", agent: "{{ticket.agent.name}}", ticket: "{{ticket.id}}" },
  hubspot: { label: "HubSpot", email: "{{contact.email}}", agent: "{{owner.firstname}}", ticket: "{{ticket.hs_object_id}}" },
  mailchimp: { label: "Mailchimp", email: "*|EMAIL|*", agent: "", ticket: "" },
} as const;
export type MergePresetId = keyof typeof MERGE_PRESETS;

export type MergeTags = { email: string; agent: string; ticket: string };

// Merge tags are inserted unencoded so the helpdesk can replace them; restrict their characters.
export const MERGE_TAG_RE = /^[A-Za-z0-9_.{}|*%$\[\]\- ]{0,80}$/;

export type SnippetInput = {
  appUrl: string;
  surveyId: string;
  iconSet: IconSetId;
  question: string;
  brandColor: string;
  mergeTags: MergeTags;
  signToken: (surveyId: string, rating: number) => string; // returns "<id>.<rating>.<sig>"
  /** The business's own labels and pictures (optional). */
  options?: ResolvedOption[];
};

export function buildClickUrl(appUrl: string, token: string, mergeTags: MergeTags): string {
  const params: string[] = [];
  if (mergeTags.email) params.push(`e=${mergeTags.email}`);
  if (mergeTags.agent) params.push(`a=${mergeTags.agent}`);
  if (mergeTags.ticket) params.push(`t=${mergeTags.ticket}`);
  return `${appUrl.replace(/\/+$/, "")}/r/${token}${params.length ? "?" + params.join("&") : ""}`;
}

const FONT = "Arial,Helvetica,sans-serif";
const INK = "#111827";
const LABEL = "#374151"; // 10:1 on white; colour is never the only signal (emoji/number + label)

/**
 * Email-client-safe buttons, following common bulletproof-email practice:
 *  - live text, no images (images are often blocked), so buttons always show
 *  - nested tables with cellpadding/border attributes and inline styles (Outlook ignores most CSS)
 *  - every tap target at least 44px tall, separated by spacer cells
 *  - explicit background + text colours on every element so dark-mode inversion stays readable
 *  - each link has a descriptive title/aria-label ("Rate: Excellent")
 */
export function buildSnippetHtml(input: SnippetInput): string {
  for (const v of Object.values(input.mergeTags)) {
    if (!MERGE_TAG_RE.test(v)) throw new Error("invalid merge tag");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.brandColor)) throw new Error("invalid colour");
  const set = ICON_SETS[input.iconSet];
  const compact = set.id === "nps" || set.id === "ces";
  const showLabels = set.id === "thumbs" || set.id === "faces3" || set.id === "faces5";

  const options = input.options ?? set.options.map((o) => ({ ...o, imageUrl: null }));
  const buttons = options.map((o) => {
    const url = buildClickUrl(input.appUrl, input.signToken(input.surveyId, o.value), input.mergeTags);
    // A custom picture always comes with its label as text, so the button still works when images are blocked.
    const image = o.imageUrl && ICON_URL_RE.test(o.imageUrl) ? o.imageUrl : null;
    const symbol = image
      ? `<img src="${escapeHtml(image)}" width="36" height="36" alt="${escapeHtml(o.label)}" style="display:block;margin:0 auto 2px auto;width:36px;height:36px;border:0;outline:none;">`
      : set.id === "stars5"
        ? `${o.value}&#9733;`
        : escapeHtml(o.symbol);
    const symbolColor = compact ? INK : o.color;
    const label = showLabels || image
      ? `<br><span style="font-family:${FONT};font-size:11px;line-height:14px;font-weight:bold;color:${LABEL};">${escapeHtml(o.label)}</span>`
      : "";
    return (
      `<td align="center" valign="middle" bgcolor="#ffffff" style="background-color:#ffffff;border:2px solid ${o.color};border-radius:8px;">` +
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="Rate: ${escapeHtml(o.label)}" aria-label="Rate: ${escapeHtml(o.label)}" ` +
      `style="display:block;padding:${compact ? "10px 0" : "8px 10px"};min-width:${compact ? 30 : 48}px;` +
      `font-family:${FONT};font-size:${compact ? 15 : 22}px;line-height:${compact ? 20 : 26}px;font-weight:bold;` +
      `color:${symbolColor};text-decoration:none;text-align:center;">${symbol}${label}</a></td>`
    );
  });
  const spacer = `<td width="${compact ? 4 : 6}" style="width:${compact ? 4 : 6}px;font-size:0;line-height:0;">&nbsp;</td>`;
  const row = buttons.join(spacer);

  const npsLegend = compact
    ? `<tr><td style="padding:4px 0 0 0;font-family:${FONT};font-size:11px;line-height:14px;color:${LABEL};">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td align="left" style="font-family:${FONT};font-size:11px;color:${LABEL};">${set.id === "ces" ? "1 = Very difficult" : "0 = Not likely"}</td>` +
      `<td align="right" style="font-family:${FONT};font-size:11px;color:${LABEL};">${set.id === "ces" ? "7 = Very easy" : "10 = Very likely"}</td>` +
      `</tr></table></td></tr>`
    : "";

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:12px 0;border:0;">` +
    `<tr><td style="padding:0 0 8px 0;font-family:${FONT};font-size:15px;line-height:20px;font-weight:bold;color:${INK};">` +
    `${escapeHtml(input.question)}</td></tr>` +
    `<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:0;"><tr>${row}</tr></table></td></tr>` +
    npsLegend +
    `</table>`
  );
}
