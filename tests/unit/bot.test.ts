import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBot } from "../../src/lib/security/bot.ts";

const headers = (h: Record<string, string> = {}) => ({
  get: (k: string) => h[k.toLowerCase()] ?? null,
});
const HTML = { accept: "text/html,application/xhtml+xml,*/*;q=0.8" };

const BROWSERS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0",
  "Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
];

test("real browsers pass", () => {
  for (const ua of BROWSERS) {
    assert.deepEqual(detectBot({ method: "GET", userAgent: ua, headers: headers(HTML) }), { bot: false }, ua);
  }
});

test("scanners, previewers and scripts are caught", () => {
  const bots = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (compatible; Proofpoint URL Defense)",
    "Mimecast-URL-Protect/1.0",
    "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17928; Pro)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
    "curl/8.5.0",
    "python-requests/2.32.3",
    "Go-http-client/2.0",
    "Java/17.0.2",
    "okhttp/4.12.0",
    "axios/1.7.2",
    "node-fetch/1.0",
  ];
  for (const ua of bots) {
    assert.equal(detectBot({ method: "GET", userAgent: ua, headers: headers(HTML) }).bot, true, ua);
  }
});

test("HEAD requests and empty agents are bots", () => {
  assert.equal(detectBot({ method: "HEAD", userAgent: BROWSERS[0]!, headers: headers(HTML) }).bot, true);
  assert.equal(detectBot({ method: "GET", userAgent: null, headers: headers(HTML) }).bot, true);
  assert.equal(detectBot({ method: "GET", userAgent: "   ", headers: headers(HTML) }).bot, true);
});

test("prefetch headers are bots", () => {
  assert.equal(detectBot({ method: "GET", userAgent: BROWSERS[0]!, headers: headers({ ...HTML, "sec-purpose": "prefetch" }) }).bot, true);
  assert.equal(detectBot({ method: "GET", userAgent: BROWSERS[0]!, headers: headers({ ...HTML, purpose: "prefetch" }) }).bot, true);
});

test("non-HTML accept is a bot", () => {
  assert.equal(detectBot({ method: "GET", userAgent: BROWSERS[0]!, headers: headers({ accept: "application/json" }) }).bot, true);
});
