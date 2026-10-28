import { expect, test, type Page } from "@playwright/test";

// Use a TEST business only. Nothing here sends emails or payments.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL and E2E_PASSWORD to run signed-in tests");

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Password").fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
}

test.beforeEach(async ({ page }) => signIn(page));

test("dashboard loads", async ({ page }) => {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("link", { name: /Responses/ }).first()).toBeVisible();
});

test("main pages open without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/app/surveys", "/app/responses", "/app/follow-ups", "/app/insights", "/app/leaderboard", "/app/businesses", "/app/settings/account"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("all businesses page lists the current business", async ({ page }) => {
  await page.goto("/app/businesses");
  await expect(page.getByRole("heading", { name: "All businesses" })).toBeVisible();
  await expect(page.getByText("Open now")).toBeVisible();
});

test("survey form checks fields", async ({ page }) => {
  await page.goto("/app/surveys/new");
  await page.getByLabel("Survey name").fill("");
  await page.getByRole("button", { name: /Create survey|Save/ }).first().click();
  await expect(page).toHaveURL(/\/app\/surveys\/new/);
});

test("customer history opens from responses", async ({ page }) => {
  await page.goto("/app/responses");
  const first = page.getByTitle("See this customer's history").first();
  test.skip((await first.count()) === 0, "no responses with an email yet");
  await first.click();
  await expect(page.getByRole("heading", { name: "Customer history" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Customer history" })).toHaveCount(0);
});

test("owners see their invite link", async ({ page }) => {
  await page.goto("/app/settings/billing");
  const card = page.getByRole("heading", { name: "Invite a business" });
  test.skip((await card.count()) === 0, "not an owner or admin");
  await expect(page.getByLabel("Your invite link")).toHaveValue(/\/signup\?ref=[A-Z2-9]{8}$/);
});

test("API calls without the CSRF header are refused even when signed in", async ({ page }) => {
  const status = await page.evaluate(async () => (await fetch("/api/account/drops", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  expect([400, 403, 405]).toContain(status);
});
