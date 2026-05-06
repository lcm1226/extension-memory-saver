# How To Use EMS

This is the current development workflow. Verify EMS only in a dedicated Chrome test profile, not in your default personal Chrome profile.

## Quick Flow

1. Open `chrome://extensions` in the Chrome test profile.
2. Turn on `Developer mode`.
3. Click `Load unpacked` and select this repo's `ems-extension` folder.
4. Open the site you want to test. Example: `https://www.youtube.com/watch?v=pa4Xo-LQe54`.
5. Open the EMS popup and review the extension list, relevance labels, and memory estimate values.

## Import Profile Inventory

Profile inventory enriches site relevance with manifest signals that the stable Chrome runtime API does not expose directly, especially `content_scripts.matches` and `optional_host_permissions`.

Run this from the repo root in PowerShell:

```powershell
.\tools\Export-EMSProfileInventory.ps1 -ProfileDir "C:\Users\lcmru\AppData\Local\Google\Chrome\User Data\Profile 5"
```

The default output file is:

```text
test-results\profile-inventory.json
```

Then open the EMS popup, click `Import JSON`, and select that JSON file.

## Import Near-Live Memory Estimates

Use the advanced probe when you want newly installed extensions to show approximate MB values quickly. Start Chrome with a remote debugging port, then run:

```powershell
node .\tools\ems-measure.mjs live-estimates `
  --host 127.0.0.1 `
  --port 9222 `
  --profile-dir "<TEST_PROFILE_DIR>" `
  --target-url "https://www.youtube.com/watch?v=pa4Xo-LQe54" `
  --out .\test-results\live-memory-estimates.json
```

Open the EMS popup, click `Import JSON`, and select `test-results\live-memory-estimates.json`. Rows with imported values show `Advanced Memory Estimate`.

If the EMS popup has been opened once and its service worker is awake, you can also write the estimates directly into EMS storage:

```powershell
node .\tools\ems-measure.mjs live-estimates --port 9222 --profile-dir "<TEST_PROFILE_DIR>" --apply-to-ems
```

Reopen the popup to render the latest values.

## Reading Memory Values

EMS can show two memory signals:

- `Advanced Memory Estimate`: a near-live estimate from the current Chrome process snapshot.
- `Measured Memory Impact`: an A/B benchmark delta measured after removing an extension under the same site and test conditions.

Confidence means:

- `high`: Chrome exposed the extension id in a process command line, so EMS summed that direct extension-owned process memory.
- `low`: EMS apportioned shared extension renderer memory or used a manifest site-match heuristic. This is useful for quick visibility on newly installed extensions, but it is not exact ownership.

The core limitation remains: stable Chrome does not attribute content-script memory inside normal page renderers to individual extensions. Treat EMS values as practical guidance, not perfect live ownership.

## Main Buttons

- `Lighten This Site`: disables likely site-relevant extensions browser-wide.
- `Restore Previous State`: restores the extension states saved before the last `Lighten This Site`.
- `Save Current Setup`: saves the currently enabled extension set for the current site.
- `Apply Saved Setup`: applies the saved set to the current browser extension state.
- `Clear Saved Setup`: deletes the saved setup for the current site.
- `Import JSON`: imports benchmark labels, live memory estimates, or profile-inventory JSON.
- `Reset Defaults`: restores seeded benchmark labels and clears imported manifest signals and live memory estimates.

## Warning

Enable, Disable, Lighten, Restore, and Apply are not tab-only actions. Chrome extension state changes apply browser-wide.