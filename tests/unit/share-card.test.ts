import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardToken, verifyCardToken, buildWallToken } from "../../src/lib/security/signing.ts";
import { planAllows } from "../../src/lib/billing/features.ts";

const S = "s".repeat(40);
const ID = "11111111-2222-4333-8444-555555555555";

test("share card links are signed and bound to one comment", () => {
  const t = buildCardToken(S, ID);
  assert.equal(verifyCardToken([S], t), ID);
  assert.equal(verifyCardToken(["x".repeat(40), S], t), ID, "old secret still works during rotation");
  assert.equal(verifyCardToken(["x".repeat(40)], t), null, "wrong secret");
  const other = "99999999-2222-4333-8444-555555555555";
  assert.equal(verifyCardToken([S], `${other}.${t.split(".")[1]}`), null, "swapping the id fails");
  assert.equal(verifyCardToken([S], buildWallToken(S, ID)), null, "a wall token isn't a card token");
  for (const bad of ["", "abc", `${ID}`, `${ID}.`, `${ID}.${"a".repeat(22)}`, `${t}x`, "a".repeat(200)]) assert.equal(verifyCardToken([S], bad), null, bad);
  assert.throws(() => buildCardToken(S, "not-a-uuid"));
});

test("share cards are a paid feature", () => {
  assert.equal(planAllows("trial", "social"), false);
  assert.equal(planAllows("free", "social"), false);
  assert.equal(planAllows("starter", "social"), true);
  assert.equal(planAllows("scale", "social"), true);
});
