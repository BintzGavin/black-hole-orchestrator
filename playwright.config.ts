import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/solar-*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  outputDir: "/tmp/black-hole-orchestrator-browser-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4176",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: { args: ["--use-angle=metal"] },
  },
  webServer: {
    command: "npm run dev:solar",
    url: "http://127.0.0.1:4176/solar-preview.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
