import { expect, test } from "@playwright/test";
import type { AgentRole, Repository } from "../shared/schema";
import { sampleAgentRoles } from "./solar-fixture";

const ORIGIN = "http://127.0.0.1:4176";
const repository: Repository = {
  id: "synthetic-solar-integration",
  owner: "synthetic-preview-owner",
  name: "Synthetic Solar Integration",
  fullName: "synthetic-preview-owner/synthetic-solar-integration",
  description:
    "Synthetic browser integration fixture. No real repository is connected.",
  defaultBranch: "main",
  lastAnalyzedAt: null,
  gravityScore: 82,
  totalPrs: 3,
  totalCommits: 12,
  createdAt: "2026-09-09T12:00:00.000Z",
};

const roles: AgentRole[] = sampleAgentRoles.map((role, index) => ({
  ...role,
  id: `synthetic-integration-role-${index + 1}`,
  repositoryId: repository.id,
  name: `Synthetic ${role.name}`,
  files: [
    {
      path: `plans/2026-09-09-synthetic-${role.name.toLowerCase()}-plan.md`,
      type: "plan",
      date: "2026-09-09T12:00:00.000Z",
    },
    {
      path: `agents/${role.name.toLowerCase()}-execution.md`,
      type: "execution-prompt",
    },
  ],
  planCount: 1,
  createdAt: `2026-09-09T12:00:${String(index).padStart(2, "0")}.000Z`,
}));

test("the original repository Agent Orbit opens the correct real plan sheet after fullscreen inspection", async ({
  browser,
}, testInfo) => {
  // An explicitly fresh, nonpersistent context isolates all IndexedDB writes
  // from the user's app/browser profiles, even though the local origin matches.
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const unexpectedApiRequests: string[] = [];
  const renderingErrors: string[] = [];

  try {
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) {
        await route.abort();
      } else if (url.pathname === "/__synthetic-solar-setup") {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html lang='en'><title>Synthetic integration setup</title><body>Synthetic local integration setup only.</body></html>",
        });
      } else if (url.pathname === "/api/github/counts") {
        await route.fulfill({
          status: 200,
          json: { totalCommits: 12, totalPrs: 3 },
        });
      } else if (url.pathname.startsWith("/api/")) {
        unexpectedApiRequests.push(url.pathname);
        await route.fulfill({
          status: 503,
          json: { error: "No backend is connected to this synthetic test." },
        });
      } else {
        await route.continue();
      }
    });

    const page = await context.newPage();
    page.on("pageerror", (error) => renderingErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /shader|WebGL|THREE|rendered (?:more|fewer) hooks/i.test(message.text())
      ) {
        renderingErrors.push(message.text());
      }
    });
    await page.goto("/__synthetic-solar-setup");
    await page.evaluate(
      async ({ repository, roles }) => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("bha-command-center", 2);
          request.onerror = () => reject(request.error);
          request.onblocked = () =>
            reject(
              new Error("The isolated synthetic database could not open."),
            );
          request.onupgradeneeded = () => {
            const database = request.result;
            database.createObjectStore("repositories", { keyPath: "id" });
            for (const storeName of [
              "agentRoles",
              "analysisResults",
              "activityEvents",
            ]) {
              const store = database.createObjectStore(storeName, {
                keyPath: "id",
              });
              store.createIndex("by-repo", "repositoryId");
            }
          };
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
              ["repositories", "agentRoles"],
              "readwrite",
            );
            transaction.objectStore("repositories").put(repository);
            for (const role of roles)
              transaction.objectStore("agentRoles").put(role);
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
            transaction.onabort = () => {
              database.close();
              reject(transaction.error);
            };
          };
        });
      },
      { repository, roles },
    );

    await page.goto(`/repo/${repository.id}`);
    const card = page.getByTestId("card-visualization");
    await expect(card.getByText("Agent Orbit", { exact: true })).toBeVisible();
    const scene = card.locator(
      `canvas[aria-label='${repository.name} agent solar system']`,
    );
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toBeVisible();
    await expect(scene).toHaveAttribute("data-ready", "true", {
      timeout: 30000,
    });
    await expect(scene).toHaveAttribute("data-world-count", "6");
    await expect(
      card
        .getByRole("navigation", { name: "Agent worlds", exact: true })
        .getByRole("button"),
    ).toHaveCount(6);

    await card
      .getByRole("button", { name: "Enter fullscreen", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
      .toBe(true);
    await card
      .getByRole("button", { name: "Focus Synthetic Frontend", exact: true })
      .click();
    await expect(scene).toHaveAttribute("data-focus", roles[0]!.id);
    await page.waitForTimeout(200);
    const bounds = (await scene.boundingBox())!;
    await scene.click({
      position: { x: bounds.width / 2, y: bounds.height / 2 },
    });

    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement === null))
      .toBe(true);
    const frontendSheet = page.getByRole("dialog", {
      name: "Activity for Synthetic Frontend",
      exact: true,
    });
    await expect(frontendSheet).toBeVisible();
    await expect(
      frontendSheet.getByText("1 plan", { exact: true }),
    ).toBeVisible();
    await expect(
      frontendSheet.getByRole("button", { name: /Synthetic Frontend Plan/ }),
    ).toBeVisible();
    await expect(
      frontendSheet.getByText("frontend-execution.md", { exact: true }),
    ).toHaveCount(0);

    await frontendSheet
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(frontendSheet).toBeHidden();
    await card
      .getByRole("button", { name: "Focus Synthetic Backend", exact: true })
      .click();
    await card
      .getByRole("button", { name: "View agent plans", exact: true })
      .click();
    const backendSheet = page.getByRole("dialog", {
      name: "Activity for Synthetic Backend",
      exact: true,
    });
    await expect(backendSheet).toBeVisible();
    await expect(
      backendSheet.getByRole("button", { name: /Synthetic Backend Plan/ }),
    ).toBeVisible();
    await expect(
      backendSheet.getByRole("button", { name: /Synthetic Frontend Plan/ }),
    ).toHaveCount(0);
    await expect(backendSheet).toBeInViewport({ ratio: 1 });
    // Let the existing sheet's opening/closing animations settle naturally.
    // Fast-forwarding CSS animations can also finish the preceding close.
    await page.waitForTimeout(600);
    await expect(backendSheet).toBeVisible();

    expect(unexpectedApiRequests).toEqual([]);
    expect(renderingErrors).toEqual([]);
    const screenshotPath = testInfo.outputPath("repository-plans.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach(
      "Original repository page with synthetic agent plans",
      { path: screenshotPath, contentType: "image/png" },
    );
  } finally {
    await context.close();
  }
});
