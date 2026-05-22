# Handoff


## Desktop companion pivot checkpoint

The active product direction is `EMS Desktop`, a Windows desktop companion that estimates Chrome extension memory impact through clone-based A/B measured-delta calibration.

Product sentence: EMS Desktop estimates which Chrome extensions add memory cost on a page by safely measuring A/B deltas in cloned probe profiles. It does not mutate your live profile and does not claim exact Chrome memory ownership.

Source-of-truth docs:

- `docs/EMS_DESKTOP_PIVOT_ROADMAP.md`
- `HANDOFF.md`
- `docs/EMS_MEASUREMENT.md`

New files/commands:

- `tools/ems-desktop-engine.mjs`: lists Probe Chrome and advanced Chromium measurement profiles, then runs automatic clone-based A/B calibration.
- `tools/Start-EMSDesktop.ps1`: builds and runs the WPF desktop app from any current directory.
- `tools/Start-EMSDesktopProbeChrome.ps1`: launches a safe debug-enabled probe Chrome profile for desktop MVP testing.
- `tools/Build-EMSDesktopPortable.ps1`: builds the portable desktop folder and ZIP.
- `docs/EMS_DESKTOP_HOW_TO_USE.ko.md`: Korean desktop usage guide.
- `docs/EMS_DESKTOP_HOW_TO_USE.en.md`: English desktop usage guide.
- `ems-desktop/`: .NET 8 WPF desktop app.

Latest desktop UX direction: use `Launch Probe Chrome` as the default path, keep remote-debugging details in advanced guidance, show a three-step onboarding flow, keep clone-safety wording visible, include an English/Korean language selector, show cached results immediately, then run a background refresh with a headless worker by default and off-screen headful fallback when headless capture fails. Result rows include colored tags for `cacheStatus`, `measurementMode`, confidence, and optional median x3 sample metadata. EMS Desktop does not mutate the live selected profile and does not provide tab-scoped live extension kill controls.

Figma draft: https://www.figma.com/design/NVA8Y0PeY6UEm6PRxPfCAK

- `npm run desktop:list`: smoke-check measurable browser discovery.
- `npm run desktop:verify-safety`: smoke-check clone-only measurement invariants without launching Chrome.
- `npm run desktop:build`: build the WPF app.
- `npm run desktop:package`: build `dist\\EMS-Desktop-Portable` with root `EMS Desktop.exe` and `dist\\EMS-Desktop-Portable.zip`.
- `npm run desktop:run`: launch the WPF app.

Important invariant: calibration must clone the selected profile into `.tmp/desktop-runs/` and must not mutate the live selected profile.
## What this project is

`EMS Memory Probe` is now centered on EMS Desktop, a Windows desktop companion for approximate Chromium extension memory impact measurement.

The Chrome extension remains as a validated artifact and optional helper candidate. It is not the primary measurement UX.

## What has been built

- CDP + Windows process-memory snapshot tool
- Near-live `live-estimates` exporter for popup-importable memory estimates
- Snapshot diff summarizer
- Chrome launcher for probe profiles
- Profile-based extension metadata resolution
- Chrome extension artifact in `ems-extension/`
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

1. Keep EMS Desktop as the primary product path and use `Launch Probe Chrome` as the default measurement flow.
2. Run `npm run desktop:verify-safety` before measurement-engine changes to confirm clone-only behavior.
3. Run `npm run desktop:build` after WPF or engine integration changes.
4. Run `npm run desktop:package` before release packaging changes.
5. Preserve `npm run test:e2e` as regression coverage for the validated extension artifact.
6. Treat `ems-extension/` as an optional helper candidate only; do not restore it as the primary measurement UI.
7. Only design Desktop-to-extension communication after the desktop MVP proves the helper would reduce real friction.

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

- EMS Desktop is the active product path. The extension remains a validated artifact, not the main measurement UX.
- `calibrate-auto` is hardened around cache-first display, background refresh, headless worker mode, and off-screen fallback.
- `desktop:verify-safety` now creates a fake profile, clones it under `.tmp\desktop-runs\`, disables an extension only in the clone, and verifies the fake source profile remains unchanged.
- Verified on 2026-05-18 against the probe Chrome profile: headless worker, cached-results event, and forced off-screen worker all completed for a one-extension YouTube run. Portable packaging is available through `npm run desktop:package`; the package now starts from root `EMS Desktop.exe` with CMD kept only as a compatibility launcher.


## Current next priorities

1. keep EMS Desktop copy and docs centered on `Launch Probe Chrome`, cloned profiles, and approximate A/B deltas
2. keep remote-debugging flag details in advanced guidance, not primary user flow
3. verify measurement safety with `npm run desktop:verify-safety` before engine changes
4. preserve old extension Playwright coverage as regression protection
5. defer optional helper design until Desktop MVP friction is clear enough to justify it

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
5. run `npm run desktop:verify-safety`
6. run `npm run test:e2e`; the npm script sets `PLAYWRIGHT_BROWSERS_PATH=0` for repo-local browser resolution
7. re-load the unpacked `ems-extension/` from the new path only if you are testing the optional extension artifact, because unpacked-extension paths are absolute
8. read `HANDOFF.md`, `docs/FOLDER_MOVE_HANDOFF.md`, and `docs/EMS_DESKTOP_PIVOT_ROADMAP.md` before editing

## Working rule

Before reporting that filesystem cleanup or path changes are complete, run verification directly.

- verify repo status
- verify JavaScript syntax for edited extension files
- verify at least one repo-internal measurement/tool command still runs from the new path layout

## What the user needs to do

1. Use EMS Desktop's `Launch Probe Chrome` button for normal measurement.
2. Install or enable the extensions to measure in that Probe Chrome profile.
3. Open the target page in Probe Chrome, then use `Refresh Profiles`.
4. Treat the Chrome extension as an optional helper artifact unless a future helper contract is explicitly designed.
