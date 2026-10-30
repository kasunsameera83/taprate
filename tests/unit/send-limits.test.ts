import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEND_LIMITS, PLAN_IDS } from "../../src/lib/billing/catalog.ts";

test("daily email limits grow with the plan, and paused can't send", () => {
  assert.equal(SEND_LIMITS.paused, 0);
  assert.ok(SEND_LIMITS.starter < SEND_LIMITS.growth && SEND_LIMITS.growth < SEND_LIMITS.scale);
  for (const p of PLAN_IDS) assert.ok(SEND_LIMITS[p] > 0, p);
});

test("the database limits match the ones shown on the pricing page", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0030_free_plan.sql", import.meta.url), "utf8");
  for (const p of PLAN_IDS) assert.match(sql, new RegExp(`when '${p}'\\s+then ${SEND_LIMITS[p]}\\b`), p);
  assert.match(sql, /when 'free'\s+then coalesce\(\(select s\.free_daily_emails/);
  assert.match(sql, /when 'trial'\s+then coalesce\(\(select s\.free_daily_emails/);
  assert.match(sql, /else 0/);
});
