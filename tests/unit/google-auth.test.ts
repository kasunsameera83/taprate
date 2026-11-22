import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewGoogleUser, isSafeOAuthUrl, usesGoogle, wrongPasswordMessage } from "../../src/lib/auth/google.ts";
import { googleStartSchema } from "../../src/lib/validation/schemas.ts";

const now = Date.parse("2026-11-21T10:00:00Z");

test("a brand-new Google user without recorded Terms needs the sign-up steps", () => {
  const fresh = { created_at: "2026-11-21T09:58:00Z", app_metadata: { provider: "google" }, user_metadata: { full_name: "A" } };
  assert.equal(isNewGoogleUser(fresh, now), true);
  assert.equal(isNewGoogleUser({ ...fresh, user_metadata: { terms_version: "2026-01" } }, now), false, "already set up");
  assert.equal(isNewGoogleUser({ ...fresh, created_at: "2026-11-20T09:00:00Z" }, now), false, "older account signing in");
  assert.equal(isNewGoogleUser({ ...fresh, app_metadata: { provider: "email" } }, now), false, "email sign-up");
  assert.equal(isNewGoogleUser({ ...fresh, created_at: "nonsense" }, now), false);
});

test("we only send people to our own Supabase sign-in page", () => {
  const sb = "https://abc.supabase.co";
  assert.equal(isSafeOAuthUrl("https://abc.supabase.co/auth/v1/authorize?provider=google", sb), true);
  assert.equal(isSafeOAuthUrl("https://evil.example/auth/v1/authorize", sb), false);
  assert.equal(isSafeOAuthUrl("http://abc.supabase.co/auth/v1/authorize", sb), false);
  assert.equal(isSafeOAuthUrl("https://abc.supabase.co/rest/v1/accounts", sb), false);
  assert.equal(isSafeOAuthUrl("not a url", sb), false);
});

test("the start request is strict", () => {
  assert.equal(googleStartSchema.safeParse({ intent: "signup", acceptTerms: true }).success, true);
  assert.equal(googleStartSchema.safeParse({ intent: "login", acceptTerms: true, ref: "ABCD2345" }).success, true);
  assert.equal(googleStartSchema.safeParse({ intent: "signup", acceptTerms: false }).success, false, "terms required");
  assert.equal(googleStartSchema.safeParse({ intent: "signup", acceptTerms: true, ref: "bad" }).success, false);
  assert.equal(googleStartSchema.safeParse({ intent: "admin", acceptTerms: true }).success, false);
  assert.equal(googleStartSchema.safeParse({ intent: "login", acceptTerms: true, redirectTo: "https://evil" }).success, false, "no extra fields");
});

test("Google users get a helpful wrong-password message", () => {
  assert.equal(usesGoogle({ app_metadata: { provider: "email", providers: ["email", "google"] } }), true);
  assert.equal(usesGoogle({ app_metadata: { provider: "email", providers: ["email"] } }), false);
  assert.equal(usesGoogle(null), false);
  assert.match(wrongPasswordMessage({ app_metadata: { provider: "google" } }), /Forgot password/);
  assert.equal(wrongPasswordMessage({ app_metadata: { provider: "email" } }), "That password is incorrect");
});
