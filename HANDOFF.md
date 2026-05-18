# Handoff


## Desktop pivot checkpoint

The active product direction has pivoted to `EMS Desktop`, a Windows WPF app that wraps the existing measurement harness and runs clone-based A/B measured-delta calibration.

Source-of-truth docs:

- `docs/EMS_DESKTOP_PIVOT_ROADMAP.md`
- `HANDOFF.md`
- `docs/EMS_MEASUREMENT.md`

New files/commands:

- `tools/ems-desktop-engine.mjs`: lists debug-enabled Chromium browsers and runs automatic clone-based A/B calibration.
- `tools/Start-EMSDesktop.ps1`: builds and runs the WPF desktop app from any current directory.
- `tools/Start-EMSDesktopProbeChrome.ps1`: launches a safe debug-enabled probe Chrome profile for desktop MVP testing.
- `tools/Build-EMSDesktopPortable.ps1`: builds the portable desktop folder and ZIP.
- `docs/EMS_DESKTOP_HOW_TO_USE.ko.md`: Korean desktop usage guide.
- `docs/EMS_DESKTOP_HOW_TO_USE.en.md`: English desktop usage guide.
- `ems-desktop/`: .NET 8 WPF desktop app.

Latest desktop UX direction: show a three-step onboarding flow, keep clone-safety wording visible, show cached results immediately, then run a background refresh with a headless worker by default and off-screen headful fallback when headless capture fails. Result rows include colored tags for `cacheStatus`, `measurementMode`, confidence, and optional median x3 sample metadata.

Figma draft: https://www.figma.com/design/NVA8Y0PeY6UEm6PRxPfCAK

- `npm run desktop:list`: smoke-check measurable browser discovery.
- `npm run desktop:build`: build the WPF app.
- `npm run desktop:package`: build `dist\\EMS-Desktop-Portable` with root `EMS Desktop.exe` and `dist\\EMS-Desktop-Portable.zip`.
- `npm run desktop:run`: launch the WPF app.

Important invariant: calibration must clone the selected profile into `.tmp/desktop-runs/` and must not mutate the live selected profile.
## What this project is

`EMS Memory Probe` is a research harness for measuring Chromium extension memory under Windows.

The project now also includes an extension MVP that uses benchmark-backed guidance instead of claiming live per-extension memory truth.

## What has been built

- CDP + Windows process-memory snapshot tool
- Near-live `live-estimates` exporter for popup-importable memory estimates
- Snapshot diff summarizer
- Chrome launcher for probe profiles
- Profile-based extension metadata resolution
- Chrome extension MVP shell in `ems-extension/`
- Store-release manifest metadata, packaged icons, release checklist, and release ZIP builder

## Key local files

- `ems-extension/manifest.json`
- `ems-extension/popup.js`
- `ems-extension/popup.html`
- `ems-extension/popup.css`
- `tools/ems-measure.mjs`
- `tools/Start-EMSProbeChrome.ps1`
- `tools/Export-EMSProfileInventory.ps1`
- `tools/Build-EMSReleasePackage.ps1`
- `docs/EMS_MEASUREMENT.md`
- `docs/STORE_RELEASE_PREP.md`
- `docs/notion-legacy/EMS_NOTION_MIGRATION_INDEX.md`

## What has been learned

1. Public stable APIs do not expose reliable per-extension total memory.
2. Stable Chrome can still provide useful session-level A/B measurement.
3. A profile-clone experiment on `docs.google.com` showed meaningful total-session deltas, but the run was not cleanly isolated to one extension.
4. Disabling `Google Docs Offline` by mutating the copied profile caused many other extension targets to disappear too, so the experiment cannot be read as a pure single-extension delta.

## Most recent measured result

From the last `diff` run:

- total private bytes: `395.93 MB -> 350.12 MB`
- total working set: `752.01 MB -> 709.69 MB`
- renderer private: `162.91 MB -> 90.82 MB`
- extension-process renderer private: `79.63 MB -> 19.09 MB`
- extension targets: `31 -> 1`

Interpretation:

- the harness works
- the A/B isolation is still weak
- current results are good enough for direction-setting, not for per-extension truth claims

See `docs/EXPERIMENT_SUMMARY.md` for the latest run in a form that can be pasted into a new session.

## Newer validated scenario

A cleaner rerun was completed with a focused YouTube test profile:

- URL: `https://www.youtube.com/watch?v=pa4Xo-LQe54`
- extensions:
  - `Dark Reader`
  - `Bideo Max: Auto 8K/4K/HD for YouTube & More`
  - `'Improve YouTube!'`

Results:

- baseline: all 3 target extensions appeared in extension targets
- removing each target extension produced `4 -> 3` target count changes
- total private and renderer private both dropped in all three A/B runs
- `ownedPrivateBytes` remained `0` for target extensions, so stable Chrome still does not expose direct per-extension totals

Operational lesson:

- Do not launch against the default Chrome `User Data` directory if `http://127.0.0.1:<port>/json/version` is unreachable.
- Use a copied probe profile in the workspace instead.
- Manual/browser verification should stay on a dedicated Chrome test profile, not the default personal profile.

## Recommended next work

1. Use `docs/EMS_MVP_SPEC.md` as the product baseline and `docs/ROADMAP_REVIEW_2026-04-17.md` as the current gap audit.
2. Load `ems-extension/` in Chrome as an unpacked extension and verify:
   - current site
   - non-web tabs such as `chrome://extensions` stay inventory-only and do not expose site actions
   - installed extension list
   - relevance inference
     - host permission matching
     - homepage host matching
     - browser-wide / tab-level permission hints
   - enable/disable
   - save/restore site setup
   - apply/clear saved site setup
   - benchmark import/reset controls
   - profile-inventory JSON import for manifest-signal relevance enrichment
   - status messages clearly explain which extensions changed or were skipped
    - protected/unavailable extensions are visibly non-toggleable
   - browser-wide action banner stays visible and matches the current tab mode
   - popup help/trust explainer reflects the current benchmark-backed and browser-wide-action model
    - `docs/example-benchmark-labels.json` imports cleanly
3. Run `npm run test:e2e` for the current Playwright smoke test.
   - this uses a test-only popup query override plus mock extensions and a test-only management fixture
- current assertions cover inventory metrics, relevance labeling, browser-wide trust banner copy, `Lighten This Site`, `Restore Previous State`, `Save Current Setup`, `Apply Saved Setup`, `Clear Saved Setup`, benchmark import/reset, profile-inventory manifest-signal import, help/trust copy, inventory-only behavior on non-web tabs, protected/unavailable bulk-action skips, and saved-setup conflict handling against protected states
4. Use `node .\tools\ems-measure.mjs live-estimates --port 9222 --profile-dir <TEST_PROFILE_DIR> --target-url <URL> --out .\test-results\live-memory-estimates.json` to generate near-live popup-importable memory estimates. Use `--apply-to-ems` only after the EMS service worker has been opened once.
5. Use `node .\tools\ems-measure.mjs export-labels <before> <after> --source <scenario> --out <file>` to turn one clean A/B probe run into popup-import JSON.
6. Use `node .\tools\ems-measure.mjs discover-scenarios <before.json> <after-dir> --after-prefix <prefix> --out <scenarios.json>` to generate a scenario spec from one baseline and a folder of after snapshots.
7. Use `.\tools\Export-EMSProfileInventory.ps1 -ProfileDir <TEST_PROFILE_DIR>` to write `test-results\profile-inventory.json` with manifest-only relevance signals from a test/probe profile.
8. Use `node .\tools\ems-measure.mjs build-catalog <scenarios.json> --out <file>` to build one import catalog from multiple scenarios.
   - if one target disappears in the `after` snapshot, the scenario can omit extension selectors entirely
   - if the diff is ambiguous, add `extensionId`, `extensionName`, or `extensionNameContains`
9. Keep `Ctrl+Shift+E` as the shipped default shortcut. Treat `Ctrl+D` as a user-side manual remap only because Chrome bookmark shortcuts take priority.
10. Only return to deeper measurement work when it unblocks a concrete product decision.
11. Public stable metadata still does not expose `optional_host_permissions` or `content_scripts.matches` through `chrome.management.ExtensionInfo`, so deeper relevance inference is currently API-capped.

## Latest verified checkpoint

- latest local verification includes Playwright coverage for:
  - inventory metrics and relevance labeling
  - browser-wide trust banner copy
  - `Lighten This Site`
  - `Restore Previous State`
  - `Save Current Setup`
  - `Apply Saved Setup`
  - `Clear Saved Setup`
  - benchmark import/reset
  - help/trust copy
  - inventory-only behavior on non-web tabs
  - protected/unavailable bulk-action skips
  - saved-setup conflict handling when protected states block part of `Apply Saved Setup`
- current product stance:
  - stable Chrome still cannot expose exact live per-extension total memory
  - EMS now supports near-live external probe estimates, but the shipped extension itself is still not a standalone live memory meter
  - benchmark entries now carry structured scenario-delta metrics and the popup shows row-level measured memory impact estimates plus confidence metadata when available
  - seeded benchmark labels currently cover only the measured YouTube 3-extension scenario: Dark Reader, Bideo Max, and Improve YouTube
  - newly installed or user-specific extensions can show low-confidence near-live estimates through `live-estimates`; higher-confidence measured impact still needs benchmark JSON import or catalog coverage
  - profile inventory can now read manifest-only relevance signals from test/probe profiles
  - popup import can use those manifest signals to improve relevance labels and site-relevant counts
  - popup now includes extension search plus All/Relevant/Enabled/Disabled/Pinned filters
  - latest verification also generated `test-results\live-memory-estimates-fixture.json` from an isolated throwaway Chromium profile; the output is ignored by git

## Latest desktop checkpoint

- EMS Desktop is the active product path. The extension MVP remains a validated artifact, not the main measurement UX.
- `calibrate-auto` is hardened around cache-first display, background refresh, headless worker mode, and off-screen fallback.
- Verified on 2026-05-18 against the probe Chrome profile: headless worker, cached-results event, and forced off-screen worker all completed for a one-extension YouTube run. Portable packaging is available through `npm run desktop:package`; the package now starts from root `EMS Desktop.exe` with CMD kept only as a compatibility launcher.


## Current next priorities

1. keep profile-inventory generation/import as an explicit probe step for now, using `Export-EMSProfileInventory.ps1` to reduce manual command friction
2. keep `live-estimates` as the practical near-live path for newly installed extensions, while preserving confidence labels and exact-ownership warnings
3. extend scenario discovery only when richer datasets need more metadata than the current one-baseline/many-after flow
4. finish Store Release final prep: Chrome Web Store screenshots, optional promo tiles, final dashboard wording/localization review, and one last release UI polish pass if needed
5. expand benchmark catalog coverage only for extensions/sites that are actually worth measuring

## Notion context

EMS Notion artifacts were migrated into `docs/notion-legacy/` on 2026-05-06. Original Notion items are retained only as reviewable legacy records and should have a `####` title prefix. Current execution should use repo docs, not Notion, as the source of truth.

## Best cloud handoff path

Use this repository as the transfer unit.
- Preferred: push to GitHub, then open the repo in Cloud Codex.
- Fallback: upload this folder or paste `HANDOFF.md` plus the latest diff output into the new session.
- If the folder moves locally, follow `docs/FOLDER_MOVE_HANDOFF.md` and use `docs/NEW_THREAD_PROMPT.md` as the next-thread opener.

## Folder move continuity

The repo should remain portable as long as the whole `ems-memory-probe` folder moves together.

After moving it:

1. open the repo from the new path
2. if Git warns about ownership, run `git config --global --add safe.directory "<new-path>"`
3. run `npm install`
4. run `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`
5. run `npm run test:e2e`; the npm script sets `PLAYWRIGHT_BROWSERS_PATH=0` for repo-local browser resolution
6. re-load the unpacked `ems-extension/` from the new path in Chrome because unpacked-extension paths are absolute
7. read `HANDOFF.md`, `docs/FOLDER_MOVE_HANDOFF.md`, and `docs/ROADMAP_REVIEW_2026-04-17.md` before editing

## Working rule

Before reporting that filesystem cleanup or path changes are complete, run verification directly.

- verify repo status
- verify JavaScript syntax for edited extension files
- verify at least one repo-internal measurement/tool command still runs from the new path layout

## What the user needs to do

1. Choose whether to use GitHub or a manual folder/upload handoff.
2. If using GitHub, create an empty remote repository and provide the URL, or push it yourself.
3. If staying local for now, identify the first 1-3 extensions you actually want benchmarked so the next experiments can use a minimal probe profile.
4. If preparing Chrome Web Store submission, capture screenshots from the dedicated test profile and review `docs/STORE_RELEASE_PREP.md`.
