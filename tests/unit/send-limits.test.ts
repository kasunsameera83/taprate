import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEND_LIMITS, PLAN_IDS } from "../../src/lib/billing/catalog.ts";

test("daily email limits grow with the plan, and free/paused stay small", () => {
  assert.ok(SEND_LIMITS.free <= 100 && SEND_LIMITS.trial <= 100);
  assert.equal(SEND_LIMITS.paused, 0);
  assert.ok(SEND_LIMITS.starter < SEND_LIMITS.growth && SEND_LIMITS.growth < SEND_LIMITS.scale);
  for (const p of PLAN_IDS) assert.ok(SEND_LIMITS[p] > 0, p);
});

test("the database limits match the ones shown on the pricing page", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0029_send_limits.sql", import.meta.url), "utf8");
  for (const [plan, n] of Object.entries(SEND_LIMITS)) {
    if (n === 0) continue; // paused falls to "else 0"
    assert.match(sql, new RegExp(`when '${plan}'\\s+then ${n}\\b`), plan);
  }
  assert.match(sql, /else 0/);
});
