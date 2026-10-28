import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("loads with a heading and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("main#main")).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("menu link scrolls to the section", async ({ page, isMobile }) => {
    test.skip(isMobile, "menu is collapsed on phones");
    await page.goto("/");
    await page.getByRole("link", { name: "Features", exact: true }).first().click();
    await expect(page.locator("#features")).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test("works with reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.mouse.wheel(0, 3000);
    await expect(page.locator("#features")).toBeAttached();
    await ctx.close();
  });

  test("no sideways scrolling on phones", async ({ page }) => {
    await page.goto("/");
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(wide).toBe(false);
  });
});

test.describe("security headers", () => {
  test("pages send a strict CSP and can't be framed", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("default-src");
    expect(h["content-security-policy"]).toContain("frame-ancestors");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  test("the app needs a sign-in", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("APIs refuse anonymous and cross-site calls", async ({ request }) => {
    expect((await request.get("/api/surveys")).status()).toBeGreaterThanOrEqual(400);
    const res = await request.post("/api/surveys", { data: { name: "x" }, headers: { Origin: "https://evil.example" } });
    expect([401, 403]).toContain(res.status());
    const tl = await request.post("/api/customers/timeline", { data: { email: "a@b.co" } });
    expect([401, 403]).toContain(tl.status());
  });

  test("bad public tokens are rejected", async ({ page, request }) => {
    const tv = await page.goto("/tv/not-a-real-token");
    expect(tv?.status()).toBe(404);
    await page.goto("/unsubscribe?t=bad");
    await expect(page.getByRole("heading", { name: /expired/i })).toBeVisible();
    expect((await request.get("/api/public/tv?t=bad")).status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("sign up", () => {
  test("checks the form before sending", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/agree to the Terms/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("shows the invite note for a valid referral link only", async ({ page }) => {
    await page.goto("/signup?ref=ABCDEFGH");
    await expect(page.getByText(/A friend invited you/)).toBeVisible();
    await page.goto("/signup?ref=<script>");
    await expect(page.getByText(/A friend invited you/)).toHaveCount(0);
  });

  test("login shows a generic error for wrong details", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("app files", () => {
  test("manifest, service worker and robots", async ({ request }) => {
    expect((await request.get("/manifest.webmanifest")).ok()).toBe(true);
    expect((await request.get("/sw.js")).ok()).toBe(true);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("/app");
  });
});
