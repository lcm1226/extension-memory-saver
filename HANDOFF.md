# Handoff

## What this project is

`EMS Memory Probe` is a research harness for measuring Chromium extension memory under Windows.

The project now also includes an extension MVP that uses benchmark-backed guidance instead of claiming live per-extension memory truth.

## What has been built

- CDP + Windows process-memory snapshot tool
- Snapshot diff summarizer
- Chrome launcher for probe profiles
- Profile-based extension metadata resolution
- Chrome extension MVP shell in `ems-extension/`

## Key local files

- `ems-extension/manifest.json`
- `ems-extension/popup.js`
- `ems-extension/popup.html`
- `ems-extension/popup.css`
- `tools/ems-measure.mjs`
- `tools/Start-EMSProbeChrome.ps1`
- `docs/EMS_MEASUREMENT.md`

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
   - status messages clearly explain which extensions changed or were skipped
    - protected/unavailable extensions are visibly non-toggleable
   - browser-wide action banner stays visible and matches the current tab mode
   - popup help/trust explainer reflects the current benchmark-backed and browser-wide-action model
    - `docs/example-benchmark-labels.json` imports cleanly
3. Run `npm run test:e2e` for the current Playwright smoke test.
   - this uses a test-only popup query override plus mock extensions and a test-only management fixture
- current assertions cover inventory metrics, relevance labeling, browser-wide trust banner copy, `Lighten This Site`, `Restore Previous State`, `Save Current Setup`, `Apply Saved Setup`, `Clear Saved Setup`, benchmark import/reset, help/trust copy, inventory-only behavior on non-web tabs, protected/unavailable bulk-action skips, and saved-setup conflict handling against protected states
4. Use `node .\tools\ems-measure.mjs export-labels <before> <after> --source <scenario> --out <file>` to turn one clean A/B probe run into popup-import JSON.
5. Use `node .\tools\ems-measure.mjs build-catalog <scenarios.json> --out <file>` to build one import catalog from multiple scenarios.
   - if one target disappears in the `after` snapshot, the scenario can omit extension selectors entirely
   - if the diff is ambiguous, add `extensionId`, `extensionName`, or `extensionNameContains`
6. Keep `Ctrl+Shift+E` as the shipped default shortcut. Treat `Ctrl+D` as a user-side manual remap only because Chrome bookmark shortcuts take priority.
7. Only return to deeper measurement work when it unblocks a concrete product decision.
8. Public stable metadata still does not expose `optional_host_permissions` or `content_scripts.matches` through `chrome.management.ExtensionInfo`, so deeper relevance inference is currently API-capped.

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
  - stable Chrome still cannot expose reliable live per-extension total memory
  - EMS should continue as a benchmark-backed control panel, not a live memory meter

## Current next priorities

1. keep reducing manual scenario authoring and catalog generation work
2. decide whether any deeper relevance inference needs a non-stable or profile-read path
3. prepare icons/basic metadata and a release UI pass once behavior stops moving
4. expand non-technical docs when the interaction model is stable

## Notion context

Project artifacts already exist in Notion under:

- `EMS - Chromium Extension Control Panel`
- `EMS Stage 0 - API Feasibility Spike`
- `EMS Stage 5 - Advanced Measurement R&D`
- `EMS Windows OS-level 측정 워크플로 설계`

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
5. run `npm run test:e2e`
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
