import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSignedInHint, signedInHintCookie, SIGNED_IN_HINT } from "../../src/lib/site/signedInHint.ts";

test("the header hint is read exactly", () => {
  assert.equal(hasSignedInHint(""), false);
  assert.equal(hasSignedInHint(`${SIGNED_IN_HINT}=1`), true);
  assert.equal(hasSignedInHint(`a=b; ${SIGNED_IN_HINT}=1; c=d`), true);
  assert.equal(hasSignedInHint(`${SIGNED_IN_HINT}=`), false);
  assert.equal(hasSignedInHint(`x${SIGNED_IN_HINT}=1`), false);
});

test("the hint carries no session data and is cleared on sign-out", () => {
  const on = signedInHintCookie(true);
  assert.equal(on.value, "1");
  assert.equal(on.options.sameSite, "lax");
  assert.ok(on.options.maxAge > 0);
  const off = signedInHintCookie(false);
  assert.equal(off.value, "");
  assert.equal(off.options.maxAge, 0);
});
