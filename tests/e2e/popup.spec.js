const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test, expect, chromium } = require("@playwright/test");

test.describe("EMS popup", () => {
  test("covers inventory, save/apply/restore flow, import, and trust copy", async () => {
    test.setTimeout(90_000);
    const extensionPath = path.resolve(__dirname, "..", "..", "ems-extension");
    const mockYoutubeExtensionPath = path.resolve(__dirname, "fixtures", "mock-youtube-helper");
    const mockDocsExtensionPath = path.resolve(__dirname, "fixtures", "mock-docs-helper");
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ems-playwright-"));

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath},${mockYoutubeExtensionPath},${mockDocsExtensionPath}`,
        `--load-extension=${extensionPath},${mockYoutubeExtensionPath},${mockDocsExtensionPath}`
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
      await expect(page.locator("#metric-installed")).toHaveText("2");
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#metric-relevant")).toHaveText("1");

      const youtubeRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "MockTube Helper" }) });
      const docsRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "MockDocs Helper" }) });

      await expect(youtubeRow.locator(".relevance-pill")).toContainText("matches this site");
      await expect(youtubeRow.locator(".impact-pill")).toContainText("not benchmarked");
      await expect(docsRow.locator(".relevance-pill")).toContainText("host access declared");

      await page.getByRole("button", { name: "Lighten This Site" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("1");
      await expect(page.locator("#status")).toContainText("Disabled 1: MockDocs Helper");

      await page.getByRole("button", { name: "Restore Previous State" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#status")).toContainText("Re-enabled 1: MockDocs Helper");

      await docsRow.getByRole("button", { name: "Disable" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("1");
      await expect(page.locator("#status")).toContainText("Disabled MockDocs Helper");

      await page.getByRole("button", { name: "Save Current Setup" }).click();
      await expect(page.locator("#status")).toContainText("Saved 1 enabled extension");

      await docsRow.getByRole("button", { name: "Enable" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#status")).toContainText("Enabled MockDocs Helper");

      await page.getByRole("button", { name: "Apply Saved Setup" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("1");
      await expect(page.locator("#status")).toContainText("Applied the saved setup");
      await expect(page.locator("#status")).toContainText("Disabled 1: MockDocs Helper");

      await page.getByRole("button", { name: "Restore Previous State" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#status")).toContainText("Re-enabled 1: MockDocs Helper");

      const youtubeExtensionId = await youtubeRow.evaluate((node) => node.dataset.extensionId);
      const importPayload = {
        extensions: {
          [youtubeExtensionId]: {
            label: "high",
            source: "playwright-import",
            notes: "Playwright import coverage for MockTube Helper."
          }
        }
      };

      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Import JSON" }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: "playwright-import.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(importPayload), "utf8")
      });

      await expect(page.locator("#status")).toContainText("Imported 1 benchmark label");
      await expect(page.locator("#benchmark-summary")).toContainText("including 1 imported label");
      await expect(youtubeRow.locator(".impact-pill")).toContainText("impact: high");

      await page.locator(".help-shell summary").click();
      await expect(page.locator(".help-shell")).toContainText("benchmark guidance");
      await expect(page.locator(".help-shell")).toContainText("browser-wide extension state");
    } finally {
      await context.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });
});
