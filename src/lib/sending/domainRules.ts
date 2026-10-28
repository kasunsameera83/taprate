// Rules for a business's own sending domain. Pure, unit-tested; same checks in the browser and server.
import { z } from "zod";

// Public mailbox providers can't be verified by a business, so they're refused up front.
const FREE = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "gmx.com", "zoho.com", "yandex.com"]);

export const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const sendingDomainSchema = z
  .object({
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, ""))
      .pipe(z.string().regex(DOMAIN_RE, "Enter a domain like mail.yourbusiness.lk"))
      .refine((v) => !FREE.has(v) && ![...FREE].some((f) => v.endsWith(`.${f}`)), "Use a domain your business owns, not a free email provider")
      .refine((v) => !/(^|\.)taptruly\./.test(v), "Use your own business's domain"),
    fromLocal: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?$/, "Use letters and numbers, e.g. feedback")
      .default("feedback"),
  })
  .strict();

export type DnsRecord = { purpose: string; type: string; name: string; value: string; priority: number | null; status: string };

/** Only the fields we show, each checked, from the provider's answer. */
export function cleanRecords(raw: unknown): DnsRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).flatMap((r) => {
    const o = r as Record<string, unknown>;
    const s = (v: unknown, max: number) => (typeof v === "string" && v.length <= max && !/[\u0000-\u001f<>]/.test(v) ? v : null);
    const type = s(o.type, 10);
    const name = s(o.name, 255);
    const value = s(o.value, 2000);
    if (!type || !/^(TXT|MX|CNAME)$/.test(type) || !name || !value) return [];
    return [{ purpose: s(o.record, 20) ?? type, type, name, value, priority: typeof o.priority === "number" ? o.priority : null, status: s(o.status, 30) ?? "not_started" }];
  });
}

export const DOMAIN_STATUSES = ["not_started", "pending", "verified", "failed", "temporary_failure"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];
export const asStatus = (v: unknown): DomainStatus => ((DOMAIN_STATUSES as readonly string[]).includes(v as string) ? (v as DomainStatus) : "pending");
