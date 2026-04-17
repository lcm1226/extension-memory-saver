const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test, expect, chromium } = require("@playwright/test");

test.describe("EMS popup", () => {
  test("renders inventory, explains decisions, and reports no-op actions", async () => {
    test.setTimeout(90_000);
    const extensionPath = path.resolve(__dirname, "..", "..", "ems-extension");
    const mockExtensionPath = path.resolve(__dirname, "fixtures", "mock-youtube-helper");
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ems-playwright-"));

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath},${mockExtensionPath}`,
        `--load-extension=${extensionPath},${mockExtensionPath}`
      ]
    });

    try {
      context.setDefaultTimeout(15_000);
      let [serviceWorker] = context.serviceWorkers();
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
      }

      const extensionId = serviceWorker.url().split("/")[2];
      const popupUrl = new URL(`chrome-extension://${extensionId}/popup.html`);
      popupUrl.searchParams.set("emsTestUrl", "https://www.youtube.com/watch?v=pa4Xo-LQe54");
      popupUrl.searchParams.set("emsTestTitle", "EMS Playwright Test");

      const page = await context.newPage();
      await page.goto(popupUrl.toString(), { waitUntil: "domcontentloaded" });

      await expect(page.locator("#tab-title")).toHaveText("EMS Playwright Test");
      await expect(page.locator("#tab-origin")).toHaveText("https://www.youtube.com");
      await expect(page.locator("#metric-installed")).toHaveText("1");
      await expect(page.locator("#metric-enabled")).toHaveText("1");
      await expect(page.locator("#metric-relevant")).toHaveText("1");

      const row = page.locator(".extension-row").first();
      await expect(row.locator(".extension-name")).toHaveText("MockTube Helper");
      await expect(row.locator(".relevance-pill")).toContainText("matches this site");
      await expect(row.locator(".impact-pill")).toContainText("not benchmarked");

      await page.getByRole("button", { name: "Lighten This Site" }).click();
      await expect(page.locator("#status")).toContainText("made no changes");

      await page.getByRole("button", { name: "Save Current Setup" }).click();
      await expect(page.locator("#status")).toContainText("Saved 1 enabled extension");

      await page.getByRole("button", { name: "Save Current Setup" }).click();
      await expect(page.locator("#status")).toContainText("already matched the current enabled set");

      await page.locator(".help-shell summary").click();
      await expect(page.locator(".help-shell")).toContainText("benchmark guidance");
      await expect(page.locator(".help-shell")).toContainText("browser-wide extension state");
    } finally {
      await context.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });
});
