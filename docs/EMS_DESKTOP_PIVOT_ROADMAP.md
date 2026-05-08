# EMS Desktop Pivot Roadmap

## Decision

EMS is pivoting from a Chrome-extension-first product to a Windows desktop app for approximate Chromium extension memory impact analysis.

The extension MVP remains in the repo as a validated artifact, but the active source of truth for new work is this desktop roadmap plus `HANDOFF.md`.

## Product Goal

Show which extensions are likely adding meaningful memory cost on the currently focused Chromium page.

The primary metric is an approximate A/B measured delta:

> With the same page loaded in a cloned probe profile, removing this extension changed session memory by about N MB.

This is intentionally not exact ownership of renderer memory. It is a practical per-page impact estimate.

## Non-Goals

- Do not claim exact live per-extension memory ownership on Stable Chrome.
- Do not mutate the user's active personal/profile browser during A/B calibration.
- Do not require manual JSON import/export for the desktop MVP user flow.
- Do not depend on Notion as the source of truth.
- Do not turn the old Chrome extension into the main measurement UI.

## Measurement Model

### Inputs

- Running Chrome/Chromium instances that expose `--remote-debugging-port`.
- The selected browser's user data directory and profile directory.
- The currently focused page URL when it can be matched through DevTools targets.
- Installed extension manifests from the selected profile.

### A/B Flow

1. Detect debug-enabled browsers.
2. Let the user select the browser/profile to measure.
3. Identify the active HTTP(S) page.
4. Clone the selected user data/profile into `.tmp/desktop-runs/`.
5. Launch a baseline clone with all target extensions enabled.
6. For each site-relevant enabled extension:
   - clone the same profile again
   - disable only that extension in the clone
   - launch the same URL
   - capture a snapshot
   - compare against baseline
7. Show approximate MB delta, confidence, and contamination warnings.

### Confidence Rules

- `medium`: only the target extension changed target counts, or no unrelated extension target-count contamination was observed.
- `low`: unrelated extension targets changed during the run, or only broad session deltas are available.
- Future `high`: requires a direct extension-owned process match or repeated stable A/B runs.

## Safety Rules

- A/B calibration must run only against cloned profiles.
- Never rename, delete, disable, or mutate extensions in the selected live profile.
- Generated clone profiles and run snapshots stay under `.tmp/desktop-runs/` and are ignored by Git.
- The app should cap automatic candidates in MVP to avoid runaway browser launches.
- The UI must label results as approximate measured deltas.

## MVP Scope

### Stage 0: Repo Source of Truth

- Add this roadmap.
- Update `HANDOFF.md` and `README.md` to point to the desktop pivot.
- Keep Notion legacy content archived only under `docs/notion-legacy/`.
- Ensure `.env` and local build/probe artifacts are ignored.

### Stage 1: Desktop Engine

- Add `tools/ems-desktop-engine.mjs`.
- Commands:
  - `list-browsers`: list debug-enabled Chromium instances with profile name, profile path, active URL/title if available.
  - `calibrate-auto`: clone the selected profile and run sequential A/B measurements for the active URL.
- Output JSON/JSONL so the UI can stream progress.

### Stage 2: WPF Desktop MVP

- Add `ems-desktop/` as a .NET 8 WPF app.
- UI:
  - browser/profile selector
  - active URL/title display
  - automatic measurement progress after browser selection
  - result table with extension name, approximate MB, confidence, and notes
- The app can invoke the Node desktop engine as its measurement backend.

### Stage 3: Verification

- Verify JS syntax for desktop engine.
- Verify `list-browsers` does not crash without debug-enabled Chrome.
- Verify WPF build.
- Preserve existing `npm run test:e2e` coverage for the old extension artifact.

### Stage 4: Usability Hardening

- Add explicit "no debug-enabled browser found" instructions.
- Add run cancellation.
- Persist latest selected browser id.
- Cache results by `extensionId + origin + extensionVersion + chromeVersion`.
- Add repeated-run median once MVP is stable.

## Known Constraints

- A normal already-running Chrome instance cannot be inspected unless it was launched with `--remote-debugging-port`.
- Stable Chrome still does not expose exact content-script renderer ownership.
- A/B runs can be slow on heavy pages because each candidate extension requires a cloned Chrome launch.
- Values can vary with page load timing, ads, video state, cache, and background network activity.

## Recommended Next Implementation Step

Build Stage 1 and Stage 2 MVP in one pass, then verify on a dedicated test/probe Chrome profile before using personal browsing profiles.
