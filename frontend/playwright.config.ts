import { defineConfig, devices } from "@playwright/test";

// E2E tests run the Next dev server on a dedicated port and mock all /api calls,
// so they're deterministic and don't need the Python backend or Ollama running.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3002",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuses an already-running dev server (Next 16 allows only one per project);
  // otherwise starts one on :3002. All /api calls are mocked in the tests.
  webServer: {
    command: "npm run dev -- --port 3002",
    url: "http://localhost:3002",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
