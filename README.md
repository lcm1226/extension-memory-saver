# EMS Memory Probe

## EMS Desktop Companion Pivot

The active product is now EMS Desktop, a Windows desktop companion for approximate Chrome extension memory impact analysis.

EMS Desktop estimates which Chrome extensions add memory cost on a page by safely measuring A/B deltas in cloned probe profiles. It does not mutate your live profile and does not claim exact Chrome memory ownership.

The Chrome extension remains in `ems-extension/` as a validated artifact and optional helper candidate. It is not the primary measurement UX. The desktop app owns measurement execution, results, cache-first display, optional median x3 repeated runs, headless-first A/B measured deltas, and off-screen fallback.

Useful commands:

```powershell
npm run desktop:list
npm run desktop:seed-profile5
npm run desktop:verify-safety
npm run desktop:build
npm run desktop:package
npm run desktop:run
npm --prefix "C:\Users\lcmru\Desktop\Codex HQ\Extension-Memory-Saver" run desktop:run
.\tools\Start-EMSDesktopProbeChrome.ps1 -Url "https://www.youtube.com/"
```

Default user flow: click `Launch Probe Chrome`, install or enable the extensions to measure in that separate profile, open the target page, then click `Refresh Profiles`. Advanced users can still connect a manually launched Chromium instance that exposes DevTools, but that is not the normal path. Korean and English usage notes live in `docs/EMS_DESKTOP_HOW_TO_USE.ko.md` and `docs/EMS_DESKTOP_HOW_TO_USE.en.md`.

For the current local YouTube test profile, seed the default Probe Chrome profile from Chrome `Profile 5` with `npm run desktop:seed-profile5`, then use `Launch Probe Chrome`. This copies selected profile/extension state into `.tmp\ems-desktop-probe-user-data\Default`; it does not mutate the source Chrome profile.

Windows-first desktop companion and measurement harness for Chromium extension memory experiments.

## Desktop portable package

Create a one-click Windows package with:

```powershell
npm run desktop:package
```

The output is ignored by Git and written to:

- `dist\\EMS-Desktop-Portable\\EMS Desktop.exe`
- `dist\EMS-Desktop-Portable.zip`

The portable package includes a root-level `EMS Desktop.exe`, the desktop measurement tools, usage docs, and a local `runtime\\node\\node.exe` so the app does not require a separate Node install for normal use. `Start EMS Desktop.cmd` remains as a compatibility launcher. It still requires an installed Chrome/Chromium browser.

## Current scope

- Launch a separate Probe Chrome profile for measurement
- Discover Probe Chrome and advanced manually launched Chromium measurement profiles
- Clone selected profiles before A/B extension changes
- Capture live `chrome.exe` memory from Windows during clone runs
- Export near-live per-extension memory estimates with confidence labels from external probe snapshots
- Resolve extension ids to profile-installed extension names, versions, and manifest relevance signals
- Compare two snapshots and summarize session-level deltas

## Repo layout

- `ems-desktop/`: Windows WPF desktop app for the active EMS product path
- `tools/ems-desktop-engine.mjs`: desktop measurement engine with cache-first, headless-first A/B calibration
- `tools/Build-EMSDesktopPortable.ps1`: portable desktop package builder
- `ems-extension/`: validated Chrome extension artifact and optional helper candidate
- `tools/ems-measure.mjs`: snapshot, profile inventory, and diff CLI
- `tools/Start-EMSProbeChrome.ps1`: helper to launch Chrome with a probe profile
- `tools/Export-EMSProfileInventory.ps1`: lightweight wrapper that writes popup-importable profile inventory JSON
- `tools/Build-EMSReleasePackage.ps1`: release ZIP builder for the unpacked extension package
- `docs/HOW_TO_USE.ko.md`: Korean development usage guide
- `docs/HOW_TO_USE.en.md`: English development usage guide
- `docs/EMS_MEASUREMENT.md`: operating notes and limitations
- `docs/EXPERIMENT_SUMMARY.md`: latest real-world run and its interpretation
- `docs/EMS_MVP_SPEC.md`: buildable EMS product definition based on measurement findings
- `docs/ROADMAP_REVIEW_2026-04-17.md`: implemented vs missing roadmap audit
- `docs/FOLDER_MOVE_HANDOFF.md`: checklist for moving this repo to a new folder or machine
- `docs/NEW_THREAD_PROMPT.md`: ready-to-paste prompt for starting a new Codex thread
- `docs/STORE_RELEASE_PREP.md`: Chrome Web Store release checklist, draft listing copy, and package instructions
- `docs/notion-legacy/`: migrated EMS Notion planning archive and legacy-marking inventory
- `docs/example-benchmark-labels.json`: sample benchmark import payload for popup testing
- `docs/generated-youtube-benchmark-labels.json`: probe-generated import payload from the validated YouTube scenario
- `docs/youtube-benchmark-scenarios.json`: scenario-spec input for multi-run catalog generation
- `HANDOFF.md`: concise context for continuing work in another Codex environment
- `tests/e2e/`: Playwright popup verification with mock extensions and management fixtures

## Current conclusion

Stable Chrome can support:

- extension target discovery
- session-level A/B memory comparison
- renderer delta analysis
- near-live direct-process estimates from an external probe when Chrome exposes extension process ids
- low-confidence estimates for site-matching installed extensions when only shared extension renderer memory is available
- test/probe profile manifest inventory for `optional_host_permissions` and `content_scripts.matches`

Stable Chrome cannot yet support:

- exact per-extension owned memory totals
- clean attribution of content-script memory inside normal page renderers
- tab-scoped extension disable control

## Immediate next steps

1. Run `npm run desktop:verify-safety` before measurement-related changes.
2. Run EMS Desktop and use `Launch Probe Chrome` as the default measurement path.
3. Install or enable the extensions to measure in the Probe Chrome profile, open the target page, then click `Refresh Profiles`.
4. Use `Median x3` only when slower repeated samples are worth the confidence improvement.
5. Keep `ems-extension/` as a regression-protected artifact and optional helper candidate, not the main measurement UI.
6. Use `npm run test:e2e` to preserve the old extension behavior while the desktop product becomes primary.
7. Use `npm run desktop:build` and `npm run desktop:package` before release packaging changes.
8. If this repo moves to a new folder or machine, follow `docs/FOLDER_MOVE_HANDOFF.md` before continuing work.

## Chrome extension artifact

The extension artifact currently includes:

- popup with current site title and origin
- installed extension inventory from `chrome.management`
- site-relevance inference from host permissions and saved site profiles
- hostname + name/description heuristic relevance boosts for common sites
- homepage host matching and permission-based relevance hints
- global enable/disable actions
- `Pause Site Extensions`, which disables enabled extensions matched to the current site while clearly warning that Chrome applies the state browser-wide
- auto-restore for live pause when the original tab closes, leaves the origin, or the pause timer expires
- save/restore current site setup
- apply/clear saved site setup for the current origin
- correct inventory-only handling for non-web tabs such as `chrome://extensions`
- pinned extensions
- protected-state and no-op messaging when Chrome will not allow a requested toggle
- explicit browser-wide action banner and browser-wide/no-op status copy
- lightweight help / trust explainer in the popup
- seeded benchmark labels for the validated YouTube scenario
- benchmark label and live memory estimate import/reset controls with row-level memory impact display
- profile-inventory JSON import for manifest-signal relevance enrichment
- extension list search and All/Relevant/Enabled/Disabled/Pinned filters
- row-level benchmark and live-estimate confidence metadata display
- probe-side near-live `live-estimates` export command with direct/shared/heuristic attribution
- probe-side compact benchmark export command
- probe-side multi-scenario catalog build command
- probe-side scenario discovery command for one-baseline/many-after snapshot sets
- probe-side lightweight profile inventory export wrapper
- probe-side profile inventory command for manifest-only relevance signals
- less-manual scenario specs for one-target removal runs
- basic Playwright popup verification with mock extensions
- test-only management fixture support for protected/unavailable scenarios
- packaged icons, store-ready manifest metadata, release checklist, and a release ZIP builder

It does not yet include:

- in-extension automatic memory access without the external probe workflow
- automatic runtime access to `optional_host_permissions` or `content_scripts.matches` without imported profile inventory
- final Chrome Web Store screenshots, optional promo tiles, and dashboard submission review

## Local test

Use EMS Desktop with `Launch Probe Chrome` for primary manual verification. Use only a dedicated Chrome test profile for optional extension artifact checks. Do not validate EMS behavior against the default personal Chrome profile.

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `ems-extension` folder
5. Open a normal website in the same test profile and test the popup
6. To enrich relevance with profile manifest signals, run `.\tools\Export-EMSProfileInventory.ps1 -ProfileDir "<TEST_PROFILE_DIR>"`
7. In the popup, click `Import JSON` and select `test-results\profile-inventory.json`
8. If you want a custom shortcut, open `chrome://extensions/shortcuts`

See `docs/HOW_TO_USE.ko.md` or `docs/HOW_TO_USE.en.md` for the shorter user-facing flow.

Live control note: the optional extension helper can disable extensions live through Chrome's `management` API. `Pause Site Extensions` targets extensions matched to the current site, but Chrome does not provide a stable page-only disable API, so the disabled state applies across the browser until `Restore Previous State`, auto-restore on tab close/origin change/timer, or a manual re-enable.

## Automated verification

1. Install repo dependencies with `npm install`
2. Install Playwright Chromium with `npx playwright install chromium`
3. Run `npm run desktop:verify-safety` to smoke-check clone-only measurement invariants
4. Run `npm run test:e2e`; the npm script sets `PLAYWRIGHT_BROWSERS_PATH=0` so it uses the repo-local Playwright browser
5. Run `npm run package:extension` when release package output needs to be verified

Current automated coverage:

- loads EMS plus a mock YouTube helper extension
- loads an additional irrelevant mock extension to exercise site filtering
- opens `popup.html` with a test tab override
- verifies inventory metrics, relevance labeling, extension search/filter controls, row-level benchmark and live-estimate confidence metadata, browser-wide trust banner copy, `Lighten This Site`, `Restore Previous State`, `Save Current Setup`, `Apply Saved Setup`, `Clear Saved Setup`, benchmark/live-estimate import/reset, profile-inventory manifest-signal import, help/trust copy, inventory-only behavior on non-web tabs, protected/unavailable bulk-action skips, and saved-setup conflict handling against protected states

## Folder move / thread handoff

This repo is the transfer unit.

If the project folder moves:

1. Copy the whole `ems-memory-probe` folder, ideally including `.git`
2. Re-load the unpacked Chrome extension from the new path because Chrome stores unpacked-extension paths as absolute paths
3. Run the bootstrap checklist in `docs/FOLDER_MOVE_HANDOFF.md`
4. Start the next Codex thread with `docs/NEW_THREAD_PROMPT.md`

## Shortcut note

The default popup shortcut is still `Ctrl+Shift+E`.

`Ctrl+D` is not a safe default because Chrome reserves it for bookmarking, so EMS should treat that binding as a manual user override only, not a shipped default.

## User actions for cloud handoff

1. Put this repo on a remote Git host if you want Cloud Codex to resume with full history.
2. If a remote is not available, carry `HANDOFF.md`, `docs/ROADMAP_REVIEW_2026-04-17.md`, and `docs/STORE_RELEASE_PREP.md` into the next session.
3. If you want more measurement runs, prepare one or two target extensions you care about most so the next experiments stay narrow.
4. If you want to publish, capture store screenshots from the dedicated test profile and review `docs/STORE_RELEASE_PREP.md` before submitting.
