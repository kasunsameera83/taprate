// Request helpers: client IP, hashing, dedupe keys, same-origin (CSRF) checks. Pure, unit-tested.
import { createHash } from "node:crypto";

type HeaderReader = { get(name: string): string | null };

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;

/**
 * Client IP as reported by the hosting platform. On Vercel, x-real-ip / the first
 * x-forwarded-for entry are set by the platform edge and cannot be spoofed by the client.
 * If you host elsewhere, make sure your proxy overwrites these headers.
 */
export function getClientIp(headers: HeaderReader): string {
  const candidates = [
    headers.get("x-real-ip"),
    (headers.get("x-forwarded-for") ?? "").split(",")[0],
  ];
  for (const c of candidates) {
    const ip = (c ?? "").trim();
    if (IPV4.test(ip) || IPV6.test(ip)) return ip;
  }
  return "unknown";
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** We never store raw IPs, only a salted hash (enough for rate limits and dedupe). */
export function hashIp(salt: string, ip: string): string {
  if (!salt || salt.length < 16) throw new Error("IP hash salt missing or too short");
  return sha256Hex(`ip:v1|${salt}|${ip}`);
}

/**
 * One response per (survey, recipient, ticket). When a link carries no recipient details
 * (e.g. a plain email signature), fall back to the same device within a 30-minute window,
 * so repeated clicks update one response instead of stuffing results.
 */
export function buildDedupeKey(args: {
  surveyId: string;
  email?: string | null;
  ticket?: string | null;
  ipHash: string;
  userAgent: string;
  nowMs?: number;
}): string {
  const email = (args.email ?? "").toLowerCase();
  const ticket = args.ticket ?? "";
  if (email || ticket) {
    return sha256Hex(`dedupe:v1|${args.surveyId}|id|${email}|${ticket}`);
  }
  const bucket = Math.floor((args.nowMs ?? Date.now()) / (30 * 60 * 1000));
  return sha256Hex(`dedupe:v1|${args.surveyId}|dev|${args.ipHash}|${args.userAgent}|${bucket}`);
}

/**
 * CSRF protection for state-changing requests: the browser must say the request came from our
 * own origin. Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE, and attackers
 * cannot forge it from a web page.
 */
export function isSameOriginRequest(method: string, headers: HeaderReader, appUrl: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  let expected: string;
  try {
    expected = new URL(appUrl).origin;
  } catch {
    return false;
  }
  const origin = headers.get("origin");
  if (origin) return origin === expected;
  // Some privacy setups strip Origin; fall back to Referer, otherwise refuse.
  const referer = headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

/** Only accept JSON bodies on JSON endpoints (blocks simple-form CSRF and content confusion). */
export function isJsonRequest(headers: HeaderReader): boolean {
  const ct = (headers.get("content-type") ?? "").toLowerCase();
  return ct === "application/json" || ct.startsWith("application/json;");
}
