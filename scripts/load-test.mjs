// A simple load test for a STAGING copy of TapRate (or localhost). Don't point it at the live site
// during business hours. It only uses public, read-only pages.
//   BASE_URL=https://staging.example.com CONCURRENCY=20 SECONDS=30 node scripts/load-test.mjs
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const concurrency = Math.min(200, Math.max(1, Number(process.env.CONCURRENCY ?? 10)));
const seconds = Math.min(300, Math.max(5, Number(process.env.SECONDS ?? 20)));
const paths = ["/", "/terms", "/privacy", "/api/health"];

const latencies = [];
const statuses = new Map();
let errors = 0;
const end = Date.now() + seconds * 1000;

async function worker(i) {
  let n = i;
  while (Date.now() < end) {
    const path = paths[n++ % paths.length];
    const t = performance.now();
    try {
      const res = await fetch(base + path, { redirect: "manual", headers: { "User-Agent": "TapRate-LoadTest/1.0" } });
      await res.arrayBuffer();
      statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
      latencies.push(performance.now() - t);
    } catch {
      errors++;
    }
  }
}

console.log(`Load test: ${base}, ${concurrency} at once, ${seconds}s`);
await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
latencies.sort((a, b) => a - b);
const pct = (p) => (latencies.length ? Math.round(latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]) : 0);
console.log(`Requests: ${latencies.length} (${Math.round(latencies.length / seconds)}/s), network errors: ${errors}`);
console.log(`Status codes: ${[...statuses.entries()].map(([s, c]) => `${s}×${c}`).join(", ")}`);
console.log(`Response time: median ${pct(50)} ms, 95% under ${pct(95)} ms, slowest ${Math.round(latencies.at(-1) ?? 0)} ms`);
console.log("429 = the rate limiter working (expected when many requests come from one computer).");
