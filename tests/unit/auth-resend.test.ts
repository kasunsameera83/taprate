import { test } from "node:test";
import assert from "node:assert/strict";
import { resendConfirmSchema } from "../../src/lib/validation/schemas.ts";

test("resend confirmation: only a valid email, nothing else", () => {
  const r = resendConfirmSchema.safeParse({ email: "  You@Example.com " });
  assert.equal(r.success && r.data.email, "you@example.com");
  assert.equal(resendConfirmSchema.safeParse({ email: "not-an-email" }).success, false);
  assert.equal(resendConfirmSchema.safeParse({ email: "a@b.co", redirectTo: "https://evil.com" }).success, false);
});

