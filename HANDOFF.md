# Handoff

## What this project is

`EMS Memory Probe` is a research harness for measuring Chromium extension memory under Windows.

The goal is not yet a store-ready extension. The current code is for measurement and feasibility work.

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
   - installed extension list
   - relevance inference
   - enable/disable
   - save/restore site setup
   - apply/clear saved site setup
   - benchmark import/reset controls
    - status messages clearly explain which extensions changed
    - `docs/example-benchmark-labels.json` imports cleanly
3. Use `node .\tools\ems-measure.mjs export-labels <before> <after> --source <scenario> --out <file>` to turn one clean A/B probe run into popup-import JSON.
4. Use `node .\tools\ems-measure.mjs build-catalog <scenarios.json> --out <file>` to build one import catalog from multiple scenarios.
5. Keep `Ctrl+Shift+E` as the shipped default shortcut. Treat `Ctrl+D` as a user-side manual remap only because Chrome bookmark shortcuts take priority.
6. Only return to deeper measurement work when it unblocks a concrete product decision.

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

## Working rule

Before reporting that filesystem cleanup or path changes are complete, run verification directly.

- verify repo status
- verify JavaScript syntax for edited extension files
- verify at least one repo-internal measurement/tool command still runs from the new path layout

## What the user needs to do

1. Choose whether to use GitHub or a manual folder/upload handoff.
2. If using GitHub, create an empty remote repository and provide the URL, or push it yourself.
3. If staying local for now, identify the first 1-3 extensions you actually want benchmarked so the next experiments can use a minimal probe profile.
