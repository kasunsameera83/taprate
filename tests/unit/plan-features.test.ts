import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FEATURE_PLAN, isPaidPlan, planAllows, planLimits, upgradeMessage, type Feature } from "../../src/lib/billing/features.ts";

const FEATURES = Object.keys(FEATURE_PLAN) as Feature[];

test("free and unpaid businesses get no paid features", () => {
  for (const plan of ["trial", "free", "paused", "", null, undefined, "bogus"]) {
    assert.equal(isPaidPlan(plan), false, String(plan));
    for (const f of FEATURES) assert.equal(planAllows(plan, f), false, `${plan} ${f}`);
    assert.deepEqual(planLimits(plan), { members: 2, locations: 1 });
  }
});

test("paid plans get everything; own domain is Scale only", () => {
  for (const plan of ["starter", "growth", "scale"]) {
    for (const f of FEATURES) assert.equal(planAllows(plan, f), f === "own_domain" ? plan === "scale" : true, `${plan} ${f}`);
    assert.ok(planLimits(plan).members >= 1000 && planLimits(plan).locations >= 1000);
  }
});

test("the database rules match (migration 0031)", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0031_plan_features.sql", import.meta.url), "utf8");
  assert.match(sql, /when 'own_domain' then p_plan = 'scale'/);
  assert.match(sql, /p_plan in \('starter', 'growth', 'scale'\)/);
  assert.match(sql, /when p_what = 'members' then 2\s+else 1/);
  for (const [table, f] of [["integrations", "integrations"], ["api_keys", "api"], ["tv_screens", "tv"], ["report_subscriptions", "reports"], ["sending_domains", "own_domain"]]) {
    assert.match(sql, new RegExp(`before insert on public\\.${table} for each row execute function private\\.require_feature\\('${f}'\\)`), table);
  }
});

test("every database refusal has a friendly message", () => {
  const route = readFileSync(new URL("../../src/lib/security/route.ts", import.meta.url), "utf8");
  for (const f of FEATURES) {
    assert.match(route, new RegExp(`upgrade required: ${f}/`), f);
    assert.match(upgradeMessage(f), /Settings → Billing/);
  }
  assert.match(route, /plan limit: locations/);
  assert.match(route, /plan limit: members/);
});
