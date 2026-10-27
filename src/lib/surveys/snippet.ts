// Builds the copy-paste HTML that goes into emails and signatures. Pure, unit-tested.
// Buttons are styled text links (no images), so they show even when a mail client blocks images.
import { ICON_SETS, type IconSetId } from "./iconSets.ts";
import { escapeHtml } from "../security/html.ts";

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
};

export function buildClickUrl(appUrl: string, token: string, mergeTags: MergeTags): string {
  const params: string[] = [];
  if (mergeTags.email) params.push(`e=${mergeTags.email}`);
  if (mergeTags.agent) params.push(`a=${mergeTags.agent}`);
  if (mergeTags.ticket) params.push(`t=${mergeTags.ticket}`);
  return `${appUrl.replace(/\/+$/, "")}/r/${token}${params.length ? "?" + params.join("&") : ""}`;
}

export function buildSnippetHtml(input: SnippetInput): string {
  for (const v of Object.values(input.mergeTags)) {
    if (!MERGE_TAG_RE.test(v)) throw new Error("invalid merge tag");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.brandColor)) throw new Error("invalid colour");
  const set = ICON_SETS[input.iconSet];
  const compact = set.id === "nps";

  const cells = set.options
    .map((o) => {
      const url = buildClickUrl(input.appUrl, input.signToken(input.surveyId, o.value), input.mergeTags);
      const pad = compact ? "6px 9px" : "8px 12px";
      const text = escapeHtml(o.symbol);
      return (
        `<td style="padding:0 3px 0 0;">` +
        `<a href="${escapeHtml(url)}" title="${escapeHtml(o.label)}" target="_blank" rel="noopener" ` +
        `style="display:inline-block;padding:${pad};border:1px solid ${o.color};border-radius:6px;` +
        `color:${o.color};font-family:Arial,Helvetica,sans-serif;font-size:${compact ? 13 : 18}px;` +
        `line-height:1.2;text-decoration:none;font-weight:bold;">${text}</a></td>`
      );
    })
    .join("");

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0;">` +
    `<tr><td style="padding:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">` +
    `<strong style="color:${input.brandColor};">${escapeHtml(input.question)}</strong></td></tr>` +
    `<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>` +
    `</table>`
  );
}
