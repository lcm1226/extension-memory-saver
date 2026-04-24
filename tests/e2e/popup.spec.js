const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test, expect, chromium } = require("@playwright/test");

async function launchPopupContext() {
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

  context.setDefaultTimeout(15_000);
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
  }

  const extensionId = serviceWorker.url().split("/")[2];
  return { context, userDataDir, extensionId };
}

async function openPopupPage(context, extensionId, options) {
  const popupUrl = new URL(`chrome-extension://${extensionId}/popup.html`);
  popupUrl.searchParams.set("emsTestUrl", options.testUrl);
  popupUrl.searchParams.set("emsTestTitle", options.testTitle);
  if (options.managementFixture) {
    popupUrl.searchParams.set("emsTestManagementFixture", options.managementFixture);
  }

  const page = await context.newPage();
  await page.goto(popupUrl.toString(), { waitUntil: "domcontentloaded" });
  return page;
}

test.describe("EMS popup", () => {
  test("covers inventory, save/apply/restore/clear flow, import/reset, and trust copy", async () => {
    test.setTimeout(90_000);
    const { context, userDataDir, extensionId } = await launchPopupContext();

    try {
      const page = await openPopupPage(
        context,
        extensionId,
        {
          testUrl: "https://www.youtube.com/watch?v=pa4Xo-LQe54",
          testTitle: "EMS Playwright Test"
        }
      );

      await expect(page.locator("#tab-title")).toHaveText("EMS Playwright Test");
      await expect(page.locator("#tab-origin")).toHaveText("https://www.youtube.com");
      await expect(page.locator("#action-scope-note")).toContainText("all tabs and windows");
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
      await expect(page.locator("#status")).toContainText("browser-wide extension state");
      await expect(page.locator("#status")).toContainText("Disabled 1: MockDocs Helper");

      await page.getByRole("button", { name: "Restore Previous State" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#status")).toContainText("Re-enabled 1: MockDocs Helper");

      await docsRow.getByRole("button", { name: "Disable" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("1");
      await expect(page.locator("#status")).toContainText("Disabled MockDocs Helper across this browser");

      await page.getByRole("button", { name: "Save Current Setup" }).click();
      await expect(page.locator("#status")).toContainText("Saved 1 enabled extension");
      await expect(page.locator("#status")).toContainText("No browser-wide extension state changed");

      await docsRow.getByRole("button", { name: "Enable" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#status")).toContainText("Enabled MockDocs Helper across this browser");

      await page.getByRole("button", { name: "Apply Saved Setup" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("1");
      await expect(page.locator("#status")).toContainText("Applied the saved setup");
      await expect(page.locator("#status")).toContainText("across this browser");
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
            metrics: {
              attribution: "scenario-ab-delta",
              totalPrivateDropBytes: 15728640,
              rendererPrivateDropBytes: 12582912,
              targetDelta: -1
            },
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
      await expect(youtubeRow.locator(".extension-meta")).toContainText("est. drop: renderer 12.00 MB / total 15.00 MB");

      await page.getByRole("button", { name: "Reset Defaults" }).click();
      await expect(page.locator("#status")).toContainText("Reset benchmark labels to the seeded defaults.");
      await expect(page.locator("#benchmark-summary")).toContainText("loaded from the seeded catalog");
      await expect(youtubeRow.locator(".impact-pill")).toContainText("impact: not benchmarked");

      await page.getByRole("button", { name: "Clear Saved Setup" }).click();
      await expect(page.locator("#status")).toContainText("Cleared the saved setup for https://www.youtube.com.");
      await expect(page.locator("#status")).toContainText("No browser-wide extension state changed");
      await expect(page.locator("#site-profile-summary")).toContainText("No saved setup for this site yet");
      await expect(page.getByRole("button", { name: "Apply Saved Setup" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Clear Saved Setup" })).toBeDisabled();

      await page.locator(".help-shell summary").click();
      await expect(page.locator(".help-shell")).toContainText("benchmark guidance");
      await expect(page.locator(".help-shell")).toContainText("browser-wide extension state");
    } finally {
      await context.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("disables site actions on tabs without a standard web origin", async () => {
    test.setTimeout(90_000);
    const { context, userDataDir, extensionId } = await launchPopupContext();

    try {
      const page = await openPopupPage(
        context,
        extensionId,
        {
          testUrl: "chrome://extensions",
          testTitle: "Chrome Extensions"
        }
      );

      await expect(page.locator("#tab-title")).toHaveText("Chrome Extensions");
      await expect(page.locator("#tab-origin")).toHaveText("chrome://extensions");
      await expect(page.locator("#action-scope-note")).toContainText("inventory-only");
      await expect(page.locator("#site-profile-summary")).toContainText("does not expose a standard web origin");
      await expect(page.getByRole("button", { name: "Lighten This Site" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Save Current Setup" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Apply Saved Setup" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Clear Saved Setup" })).toBeDisabled();
      await expect(page.locator("#metric-installed")).toHaveText("2");
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#metric-relevant")).toHaveText("0");
    } finally {
      await context.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("shows protected and unavailable extensions and reports skipped bulk actions", async () => {
    test.setTimeout(90_000);
    const { context, userDataDir, extensionId } = await launchPopupContext();

    try {
      const page = await openPopupPage(
        context,
        extensionId,
        {
          testUrl: "https://www.youtube.com/watch?v=pa4Xo-LQe54",
          testTitle: "EMS Protected Fixture",
          managementFixture: "protected"
        }
      );

      await expect(page.locator("#metric-installed")).toHaveText("4");
      await expect(page.locator("#metric-enabled")).toHaveText("3");
      await expect(page.locator("#metric-relevant")).toHaveText("2");

      const protectedTubeRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "ProtectedTube Helper" }) });
      const lockedOffTubeRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "LockedOffTube Helper" }) });
      const protectedDocsRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "ProtectedDocs Helper" }) });
      const toggleableDocsRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "ToggleableDocs Helper" }) });

      await expect(protectedTubeRow.locator(".state-toggle")).toHaveText("Protected");
      await expect(protectedTubeRow.locator(".state-toggle")).toBeDisabled();
      await expect(protectedTubeRow.locator(".extension-meta")).toContainText("cannot disable here");

      await expect(lockedOffTubeRow.locator(".state-toggle")).toHaveText("Unavailable");
      await expect(lockedOffTubeRow.locator(".state-toggle")).toBeDisabled();
      await expect(lockedOffTubeRow.locator(".extension-meta")).toContainText("cannot enable here");

      await page.getByRole("button", { name: "Lighten This Site" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#status")).toContainText("browser-wide extension state");
      await expect(page.locator("#status")).toContainText("Disabled 1: ToggleableDocs Helper");
      await expect(page.locator("#status")).toContainText("Could not disable 1: ProtectedDocs Helper");
      await expect(page.locator("#status")).toContainText("Could not enable 1: LockedOffTube Helper");
      await expect(toggleableDocsRow.locator(".enabled-pill")).toContainText("disabled");
      await expect(protectedDocsRow.locator(".enabled-pill")).toContainText("enabled");

      await page.getByRole("button", { name: "Restore Previous State" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("3");
      await expect(page.locator("#status")).toContainText("Re-enabled 1: ToggleableDocs Helper");
      await expect(toggleableDocsRow.locator(".enabled-pill")).toContainText("enabled");
    } finally {
      await context.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("reports saved-setup conflicts when protected states block apply", async () => {
    test.setTimeout(90_000);
    const { context, userDataDir, extensionId } = await launchPopupContext();

    try {
      const page = await openPopupPage(
        context,
        extensionId,
        {
          testUrl: "https://www.youtube.com/watch?v=pa4Xo-LQe54",
          testTitle: "EMS Saved Setup Conflict Fixture",
          managementFixture: "protected"
        }
      );

      await page.evaluate(async () => {
        await chrome.storage.local.set({
          siteProfiles: {
            "https://www.youtube.com": {
              origin: "https://www.youtube.com",
              allowedExtensionIds: [
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "cccccccccccccccccccccccccccccccc"
              ],
              updatedAt: new Date().toISOString()
            }
          }
        });
      });

      await page.reload({ waitUntil: "domcontentloaded" });

      const protectedDocsRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "ProtectedDocs Helper" }) });
      const toggleableDocsRow = page.locator(".extension-row", { has: page.locator(".extension-name", { hasText: "ToggleableDocs Helper" }) });

      await expect(page.locator("#site-profile-summary")).toContainText("2 extension(s) saved for this site");
      await expect(page.getByRole("button", { name: "Apply Saved Setup" })).toBeEnabled();

      await page.getByRole("button", { name: "Apply Saved Setup" }).click();
      await expect(page.locator("#metric-enabled")).toHaveText("2");
      await expect(page.locator("#status")).toContainText("Applied the saved setup for https://www.youtube.com across this browser");
      await expect(page.locator("#status")).toContainText("Disabled 1: ToggleableDocs Helper");
      await expect(page.locator("#status")).toContainText("Could not disable 1: ProtectedDocs Helper");
      await expect(page.locator("#status")).toContainText("Could not enable 1: LockedOffTube Helper");
      await expect(toggleableDocsRow.locator(".enabled-pill")).toContainText("disabled");
      await expect(protectedDocsRow.locator(".enabled-pill")).toContainText("enabled");
    } finally {
      await context.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });
});
