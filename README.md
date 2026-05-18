# EMS Memory Probe

## EMS Desktop Pivot

The active product direction is now the Windows desktop MVP documented in `docs/EMS_DESKTOP_PIVOT_ROADMAP.md`.

The old Chrome extension remains in `ems-extension/` as a validated artifact, but the desktop app is the path for approximate per-page extension memory impact. The desktop MVP uses cloned probe profiles, cache-first display, headless-first A/B measured deltas, and off-screen fallback so it can show rough MB impact without mutating the live selected profile.

Useful commands:

```powershell
npm run desktop:list
npm run desktop:build
npm run desktop:run
npm --prefix "C:\Users\lcmru\Desktop\Codex Draft\ems-memory-probe" run desktop:run
.\tools\Start-EMSDesktopProbeChrome.ps1 -Url "https://www.youtube.com/"
```

A measurable browser must be launched with `--remote-debugging-port`. Use `tools/Start-EMSDesktopProbeChrome.ps1` or the app `Launch Probe Chrome` button for a safe empty probe profile. Korean usage notes live in `docs/EMS_DESKTOP_HOW_TO_USE.ko.md`. The desktop app lists those debug-enabled browser/profile instances, shows cached measurements when available, and refreshes them in the background.

Windows-first measurement harness and extension MVP for Chromium extension memory experiments.

## Current scope

- Capture Chrome DevTools Protocol targets from a remote debugging port
- Capture live `chrome.exe` memory from Windows
- Export near-live per-extension memory estimates with confidence labels from the current Chrome process snapshot
- Resolve extension ids to profile-installed extension names, versions, and manifest relevance signals
- Compare two snapshots and summarize session-level deltas

## Repo layout

- `ems-extension/`: Chrome extension MVP shell
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

1. Load `ems-extension/` as an unpacked extension and verify popup behavior in Chrome.
2. Keep the Windows probe as a supporting benchmark workflow, not as the product itself.
3. Validate site profile actions and benchmark import/reset flow in the popup.
4. Use `docs/example-benchmark-labels.json` if you want a safe example import file.
5. Use `docs/ROADMAP_REVIEW_2026-04-17.md` as the current gap list before starting more feature work.
6. Use `node .\tools\ems-measure.mjs live-estimates --port 9222 --profile-dir <TEST_PROFILE_DIR> --target-url <URL> --out .\test-results\live-memory-estimates.json` when you want near-live popup-importable memory estimates.
7. Use `node .\tools\ems-measure.mjs export-labels ...` when you want A/B probe results in popup-import format.
8. Use `node .\tools\ems-measure.mjs discover-scenarios .\snapshots\yt3-baseline.json .\snapshots ...` when you want to generate a catalog scenario spec from one baseline and a folder of after snapshots.
9. Use `.\tools\Export-EMSProfileInventory.ps1 -ProfileDir <TEST_PROFILE_DIR>` to inspect manifest-only relevance signals from a test/probe profile and write `test-results\profile-inventory.json`.
10. Use `node .\tools\ems-measure.mjs build-catalog .\docs\youtube-benchmark-scenarios.json ...` when you want one catalog from multiple scenarios.
11. In scenario specs, omit extension selectors when the `after` snapshot removes exactly one extension target; only add `extensionId`, `extensionName`, or `extensionNameContains` when the diff is ambiguous.
12. Use `npm run test:e2e` for the current Playwright popup smoke test.
13. Use `npm run package:extension` to create `dist\extension-memory-saver-0.2.0.zip` for Chrome Web Store upload testing.
14. Use `docs/STORE_RELEASE_PREP.md` for listing copy, permission/privacy rationale, screenshot requirements, and the remaining manual release checklist.
15. If this repo moves to a new folder or machine, follow `docs/FOLDER_MOVE_HANDOFF.md` before continuing work.

## Current MVP shell

The extension shell currently includes:

- popup with current site title and origin
- installed extension inventory from `chrome.management`
- site-relevance inference from host permissions and saved site profiles
- hostname + name/description heuristic relevance boosts for common sites
- homepage host matching and permission-based relevance hints
- global enable/disable actions
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

Use only a dedicated Chrome test profile for manual EMS verification. Do not validate EMS behavior against the default personal Chrome profile.

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `ems-extension` folder
5. Open a normal website in the same test profile and test the popup
6. To enrich relevance with profile manifest signals, run `.\tools\Export-EMSProfileInventory.ps1 -ProfileDir "<TEST_PROFILE_DIR>"`
7. In the popup, click `Import JSON` and select `test-results\profile-inventory.json`
8. If you want a custom shortcut, open `chrome://extensions/shortcuts`

See `docs/HOW_TO_USE.ko.md` or `docs/HOW_TO_USE.en.md` for the shorter user-facing flow.

## Automated verification

1. Install repo dependencies with `npm install`
2. Install Playwright Chromium with `npx playwright install chromium`
3. Run `npm run test:e2e`; the npm script sets `PLAYWRIGHT_BROWSERS_PATH=0` so it uses the repo-local Playwright browser
4. Run `npm run package:extension` when release package output needs to be verified

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
