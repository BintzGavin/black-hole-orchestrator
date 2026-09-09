import { expect, test, type Page } from "@playwright/test";
import { sampleAgentRoles } from "./solar-fixture";
import { writeFile } from "node:fs/promises";

const PREVIEW_URL = "/solar-preview.html";

function observeRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /shader|WebGL|THREE|rendered (?:more|fewer) hooks|hooks.*order/i.test(
        message.text(),
      )
    ) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function openPreview(page: Page) {
  await page.goto(PREVIEW_URL);
  // The canvas retains its actual accessible name; readiness belongs to the engine.
  const scene = page.locator(
    "canvas[aria-label='Black Hole Orchestrator agent solar system']",
  );
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(
    page.getByRole("heading", {
      name: "Local visual preview · synthetic agent data",
      exact: true,
    }),
  ).toBeVisible();
  return scene;
}

test("renders the actual agent identities and passes the inspected role id through the component callback", async ({
  page,
}) => {
  const errors = observeRuntimeErrors(page);
  const scene = await openPreview(page);
  const worlds = page.getByRole("navigation", {
    name: "Agent worlds",
    exact: true,
  });
  await expect(worlds.getByRole("button")).toHaveCount(6);
  await expect(scene).toHaveAttribute("data-world-count", "6");
  await expect(
    page.getByRole("status", { name: "Agent callback result" }),
  ).toHaveText("No agent inspected");

  await worlds
    .getByRole("button", { name: "Focus Frontend", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-focus", sampleAgentRoles[0]!.id);
  await page.waitForTimeout(900);
  const bounds = (await scene.boundingBox())!;
  await scene.click({
    position: { x: bounds.width / 2, y: bounds.height / 2 },
  });
  await expect(
    page.getByRole("status", { name: "Agent callback result" }),
  ).toHaveText(`Inspected role: ${sampleAgentRoles[0]!.id}`);

  for (const role of [
    sampleAgentRoles[0]!,
    sampleAgentRoles[3]!,
    sampleAgentRoles[5]!,
  ]) {
    const focus = worlds.getByRole("button", {
      name: `Focus ${role.name}`,
      exact: true,
    });
    await focus.click();
    await expect(focus).toHaveAttribute("aria-pressed", "true");
    await expect(scene).toHaveAttribute("data-focus", role.id);
    await expect(
      page.getByRole("region", { name: "Agent world details", exact: true }),
    ).toContainText(role.name);
    await page
      .getByRole("button", { name: "View agent plans", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Agent callback result" }),
    ).toHaveText(`Inspected role: ${role.id}`);
  }

  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(scene).toHaveAttribute("data-focus", "overview");
  await expect(worlds.getByRole("button", { pressed: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("supports zero, one, and twelve live roles and active-to-drifting status transitions", async ({
  page,
}) => {
  const errors = observeRuntimeErrors(page);
  const scene = await openPreview(page);
  const count = page.getByRole("combobox", {
    name: "Agent count",
    exact: true,
  });

  await count.selectOption("0");
  await expect(scene).toHaveAttribute("data-world-count", "0");
  await expect(
    page.getByRole("navigation", { name: "Agent worlds", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Agent world details", exact: true }),
  ).toContainText("Scan this repository");

  await count.selectOption("1");
  await expect(scene).toHaveAttribute("data-world-count", "1");
  await expect(
    page
      .getByRole("navigation", { name: "Agent worlds", exact: true })
      .getByRole("button"),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Focus Frontend", exact: true })
    .click();
  const details = page.getByRole("region", {
    name: "Agent world details",
    exact: true,
  });
  await expect(details.locator("[data-status='active']")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Frontend status", exact: true })
    .selectOption("drifting");
  await expect(details.locator("[data-status='drifting']")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Frontend status", exact: true })
    .selectOption("active");
  await expect(details.locator("[data-status='active']")).toBeVisible();

  await count.selectOption("12");
  await expect(scene).toHaveAttribute("data-world-count", "12");
  const worlds = page.getByRole("navigation", {
    name: "Agent worlds",
    exact: true,
  });
  await expect(worlds.getByRole("button")).toHaveCount(12);
  await worlds
    .getByRole("button", { name: "Focus Release", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View agent plans", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Agent callback result" }),
  ).toHaveText("Inspected role: preview-agent-12");
  await count.selectOption("1");
  await expect(details).toContainText("One repository. Many worlds.");
  await expect(scene).toHaveAttribute("data-ready", "true");
  expect(errors).toEqual([]);
});

test("pauses and resumes actual celestial motion and returns from spaceship camera", async ({
  page,
}) => {
  const errors = observeRuntimeErrors(page);
  const scene = await openPreview(page);
  const pause = page.getByRole("button", { name: "Pause motion", exact: true });
  await page.mouse.move(2, 2);
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await pause.click();
  await expect(scene).toHaveAttribute("data-motion", "paused");
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  const projectedLabels = page.locator(".agent-world-label:not([hidden])");
  await expect(projectedLabels.first()).toBeVisible();
  await page.waitForTimeout(120);
  const positions = await projectedLabels.evaluateAll((labels) =>
    labels.map((label) => (label as HTMLElement).style.transform),
  );
  await page.waitForTimeout(400);
  expect(
    await projectedLabels.evaluateAll((labels) =>
      labels.map((label) => (label as HTMLElement).style.transform),
    ),
  ).toEqual(positions);
  await pause.click();
  await expect(scene).toHaveAttribute("data-motion", "running");
  await expect
    .poll(async () =>
      JSON.stringify(
        await projectedLabels.evaluateAll((labels) =>
          labels.map((label) => (label as HTMLElement).style.transform),
        ),
      ),
    )
    .not.toBe(JSON.stringify(positions));

  const spaceship = page.getByRole("button", {
    name: "Spaceship camera",
    exact: true,
  });
  await spaceship.click();
  await expect(spaceship).toHaveAttribute("aria-pressed", "true");
  await expect(scene).toHaveAttribute("data-focus", "spaceship");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(spaceship).toHaveAttribute("aria-pressed", "false");
  await expect(scene).toHaveAttribute("data-focus", "overview");
  expect(errors).toEqual([]);
});

test("follows reduced-motion changes until the operator explicitly resumes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = observeRuntimeErrors(page);
  const scene = await openPreview(page);
  const controls = page.getByRole("region", {
    name: "Agent solar system controls",
    exact: true,
  });
  const pause = page.getByRole("button", { name: "Pause motion", exact: true });
  await expect(controls).toHaveAttribute("data-reduced-motion", "true");
  await expect(scene).toHaveAttribute("data-motion", "paused");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(controls).toHaveAttribute("data-reduced-motion", "false");
  await expect(scene).toHaveAttribute("data-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene).toHaveAttribute("data-motion", "paused");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await expect(scene).toHaveAttribute("data-motion", "running");
  await expect(controls).toHaveAttribute("data-reduced-motion", "true");
  expect(errors).toEqual([]);
});

test("exits fullscreen before agent plan callbacks from both the toolbar and a picked world", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = observeRuntimeErrors(page);
  const scene = await openPreview(page);
  await page.evaluate(() => {
    const output = document.querySelector(
      "[aria-label='Agent callback result']",
    )!;
    const observations: Array<{ text: string; fullscreen: boolean }> = [];
    (
      window as unknown as { previewCallbackObservations: typeof observations }
    ).previewCallbackObservations = observations;
    new MutationObserver(() => {
      observations.push({
        text: output.textContent ?? "",
        fullscreen: Boolean(document.fullscreenElement),
      });
    }).observe(output, { subtree: true, characterData: true, childList: true });
  });

  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await page
    .getByRole("button", { name: "Focus Frontend", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View agent plans", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Agent callback result" }),
  ).toHaveText("Inspected role: preview-agent-01");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);

  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await page
    .getByRole("button", { name: "Focus Backend", exact: true })
    .click();
  await expect(scene).toHaveAttribute("data-focus", "preview-agent-02");
  await page.waitForTimeout(900);
  const bounds = (await scene.boundingBox())!;
  await scene.click({
    position: { x: bounds.width / 2, y: bounds.height / 2 },
  });
  await expect(
    page.getByRole("status", { name: "Agent callback result" }),
  ).toHaveText("Inspected role: preview-agent-02");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);

  const observations = await page.evaluate(
    () =>
      (
        window as unknown as {
          previewCallbackObservations: Array<{
            text: string;
            fullscreen: boolean;
          }>;
        }
      ).previewCallbackObservations,
  );
  expect(observations.map((observation) => observation.text)).toEqual([
    "Inspected role: preview-agent-01",
    "Inspected role: preview-agent-02",
  ]);
  expect(
    observations.every((observation) => observation.fullscreen === false),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("keeps orbit view when a pending spaceship load finishes after Reset", async ({
  page,
}) => {
  let releaseModel!: () => void;
  let markRequested!: () => void;
  let markFulfilled!: () => void;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  const fulfilled = new Promise<void>((resolve) => {
    markFulfilled = resolve;
  });
  await page.route("**/models/alien-riding.glb", async (route) => {
    markRequested();
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
    markFulfilled();
  });
  const errors = observeRuntimeErrors(page);
  const scene = await openPreview(page);
  const spaceship = page.getByRole("button", {
    name: "Spaceship camera",
    exact: true,
  });
  try {
    await spaceship.click();
    await requested;
    await expect(spaceship).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    await expect(scene).toHaveAttribute("data-focus", "overview");
    releaseModel();
    await fulfilled;
    // Permit the GLB parser and deferred load callback to complete after delivery.
    await page.waitForTimeout(1200);
    await expect(scene).toHaveAttribute("data-focus", "overview");
    await expect(spaceship).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  } finally {
    releaseModel();
  }
});

test("keeps pause and reset usable when the optional spaceship model fails", async ({
  page,
}) => {
  await page.route("**/models/alien-riding.glb", (route) =>
    route.abort("failed"),
  );
  const scene = await openPreview(page);
  await page
    .getByRole("button", { name: "Spaceship camera", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Spaceship model could not load",
  );
  const reset = page.getByRole("button", { name: "Reset view", exact: true });
  const pause = page.getByRole("button", { name: "Pause motion", exact: true });
  await expect(reset).toBeEnabled();
  await expect(pause).toBeEnabled();
  await reset.click();
  await expect(scene).toHaveAttribute("data-focus", "overview");
  await pause.click();
  await expect(scene).toHaveAttribute("data-motion", "paused");
  await pause.click();
  await expect(scene).toHaveAttribute("data-motion", "running");
});

test("keeps twelve agents and keyboard navigation reachable on mobile without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = observeRuntimeErrors(page);
  const scene = await openPreview(page);
  await page
    .getByRole("combobox", { name: "Agent count", exact: true })
    .selectOption("12");
  const worlds = page.getByRole("navigation", {
    name: "Agent worlds",
    exact: true,
  });
  const first = worlds.getByRole("button").first();
  const last = worlds.getByRole("button").last();
  await first.focus();
  await page.keyboard.press("End");
  await expect(last).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(last).toHaveAttribute("aria-pressed", "true");
  await expect(scene).toHaveAttribute("data-focus", "preview-agent-12");
  await page
    .getByRole("button", { name: "View agent plans", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Agent callback result" }),
  ).toContainText("preview-agent-12");
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  expect(errors).toEqual([]);
  await page.waitForTimeout(1000); // Capture the settled overview after camera travel.
  const screenshotPath = testInfo.outputPath("mobile.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("Original orchestrator mobile twelve-agent preview", {
    path: screenshotPath,
    contentType: "image/png",
  });
});

test("sustains the original orchestrator solar rendering budget", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = observeRuntimeErrors(page);
  await openPreview(page);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1800);
  const measurement = await page.evaluate(
    () =>
      new Promise<{ fps: number; frames: number }>((resolve) => {
        let frames = 0;
        const started = performance.now();
        const sample = (now: number) => {
          frames += 1;
          if (now - started >= 2000)
            resolve({ fps: (frames * 1000) / (now - started), frames });
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(measurement.fps).toBeGreaterThanOrEqual(45);
  expect(errors).toEqual([]);
  const screenshotPath = testInfo.outputPath("overview.png");
  const measurementPath = testInfo.outputPath("frame-rate.json");
  await page.screenshot({ path: screenshotPath });
  await writeFile(
    measurementPath,
    JSON.stringify(measurement, null, 2),
    "utf8",
  );
  await testInfo.attach("Original orchestrator solar overview", {
    path: screenshotPath,
    contentType: "image/png",
  });
  await testInfo.attach("Original orchestrator solar frame rate", {
    path: measurementPath,
    contentType: "application/json",
  });
});
