// Browser tests (Playwright). Run on your laptop:
//   npm i -D @playwright/test && npx playwright install
//   npm run e2e                      (starts `npm run dev` for you)
//   E2E_BASE_URL=https://staging.example.com npm run e2e   (against a deployed test site)
// Signed-in tests run only when E2E_EMAIL and E2E_PASSWORD are set (a TEST account without two-step sign-in).
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
