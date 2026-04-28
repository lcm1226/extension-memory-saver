# EMS Memory Probe

Windows-first measurement harness for Chromium extension memory experiments.

## Current scope

- Capture Chrome DevTools Protocol targets from a remote debugging port
- Capture live `chrome.exe` memory from Windows
- Resolve extension ids to profile-installed extension names, versions, and manifest relevance signals
- Compare two snapshots and summarize session-level deltas

## Repo layout

- `ems-extension/`: Chrome extension MVP shell
- `tools/ems-measure.mjs`: snapshot, profile inventory, and diff CLI
- `tools/Start-EMSProbeChrome.ps1`: helper to launch Chrome with a probe profile
- `docs/EMS_MEASUREMENT.md`: operating notes and limitations
- `docs/EXPERIMENT_SUMMARY.md`: latest real-world run and its interpretation
- `docs/EMS_MVP_SPEC.md`: buildable EMS product definition based on measurement findings
- `docs/ROADMAP_REVIEW_2026-04-17.md`: implemented vs missing roadmap audit
- `docs/FOLDER_MOVE_HANDOFF.md`: checklist for moving this repo to a new folder or machine
- `docs/NEW_THREAD_PROMPT.md`: ready-to-paste prompt for starting a new Codex thread
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
- test/probe profile manifest inventory for `optional_host_permissions` and `content_scripts.matches`

Stable Chrome cannot yet support:

- reliable per-extension owned memory totals
- clean attribution of content-script memory
- tab-scoped extension disable control

## Immediate next steps

1. Load `ems-extension/` as an unpacked extension and verify popup behavior in Chrome.
2. Keep the Windows probe as a supporting benchmark workflow, not as the product itself.
3. Validate site profile actions and benchmark import/reset flow in the popup.
4. Use `docs/example-benchmark-labels.json` if you want a safe example import file.
5. Use `docs/ROADMAP_REVIEW_2026-04-17.md` as the current gap list before starting more feature work.
6. Use `node .\tools\ems-measure.mjs export-labels ...` when you want probe results in popup-import format.
7. Use `node .\tools\ems-measure.mjs discover-scenarios .\snapshots\yt3-baseline.json .\snapshots ...` when you want to generate a catalog scenario spec from one baseline and a folder of after snapshots.
8. Use `node .\tools\ems-measure.mjs profile-inventory --profile-dir <TEST_PROFILE_DIR> --out .\test-results\profile-inventory.json` to inspect manifest-only relevance signals from a test/probe profile.
9. Use `node .\tools\ems-measure.mjs build-catalog .\docs\youtube-benchmark-scenarios.json ...` when you want one catalog from multiple scenarios.
10. In scenario specs, omit extension selectors when the `after` snapshot removes exactly one extension target; only add `extensionId`, `extensionName`, or `extensionNameContains` when the diff is ambiguous.
11. Use `npm run test:e2e` for the current Playwright popup smoke test.
12. If this repo moves to a new folder or machine, follow `docs/FOLDER_MOVE_HANDOFF.md` before continuing work.

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
- benchmark label import/reset controls with row-level measured memory impact display
- profile-inventory JSON import for manifest-signal relevance enrichment
- probe-side compact benchmark export command
- probe-side multi-scenario catalog build command
- probe-side scenario discovery command for one-baseline/many-after snapshot sets
- probe-side profile inventory command for manifest-only relevance signals
- less-manual scenario specs for one-target removal runs
- basic Playwright popup verification with mock extensions
- test-only management fixture support for protected/unavailable scenarios

It does not yet include:

- automatic runtime access to `optional_host_permissions` or `content_scripts.matches` without imported profile inventory
- packaged icons or store-ready metadata

## Local test

Use only a dedicated Chrome test profile for manual EMS verification. Do not validate EMS behavior against the default personal Chrome profile.

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `ems-extension` folder
5. Open a normal website in the same test profile and test the popup
6. To enrich relevance with profile manifest signals, import a `profile-inventory` JSON through the popup `Import JSON` button
7. If you want a custom shortcut, open `chrome://extensions/shortcuts`

## Automated verification

1. Install repo dependencies with `npm install`
2. Install Playwright Chromium with `npx playwright install chromium`
3. Run `npm run test:e2e`; the npm script sets `PLAYWRIGHT_BROWSERS_PATH=0` so it uses the repo-local Playwright browser

Current automated coverage:

- loads EMS plus a mock YouTube helper extension
- loads an additional irrelevant mock extension to exercise site filtering
- opens `popup.html` with a test tab override
- verifies inventory metrics, relevance labeling, browser-wide trust banner copy, `Lighten This Site`, `Restore Previous State`, `Save Current Setup`, `Apply Saved Setup`, `Clear Saved Setup`, benchmark import/reset, profile-inventory manifest-signal import, help/trust copy, inventory-only behavior on non-web tabs, protected/unavailable bulk-action skips, and saved-setup conflict handling against protected states

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
2. If a remote is not available, carry `HANDOFF.md` and `docs/EXPERIMENT_SUMMARY.md` into the next session.
3. If you want more measurement runs, prepare one or two target extensions you care about most so the next experiments stay narrow.
