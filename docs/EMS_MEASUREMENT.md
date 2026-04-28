# EMS Measurement Harness

This workspace contains a first-pass Chrome extension memory probe for Windows.

## What it does

- Reads Chrome DevTools targets from a remote debugging port.
- Reads browser-level process metadata through CDP.
- Reads live `chrome.exe` process memory from Windows.
- Tries to match extension ids to OS processes when Chrome exposes the id in process command lines.
- Resolves extension names and versions from a Chrome profile when `--profile-dir` is provided.
- Saves a JSON snapshot for later diffing.

## Files

- `ems-measure.mjs`: main probe script

## Why this is only a first pass

There is no stable public API that gives:

- current-tab active extensions
- per-extension total memory
- per-tab disable control

So the probe uses a layered attribution model:

1. Direct process ownership
Extension service worker/background processes that can be tied to an extension id.

2. Renderer delta
Run the same tab set with an extension enabled and disabled, then diff snapshots.

The direct-process number is hard evidence. The renderer delta is an estimate.

## Recommended workflow

1. Start Chrome with a dedicated remote debugging port.
2. Capture a baseline snapshot.
3. Disable one target extension or extension set.
4. Capture an after snapshot.
5. Run `diff` to compare the two files.

## Launch example

Use a separate Chrome instance when possible.

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\ems-chrome-profile"
```

For EMS verification, use a dedicated test profile or a copied probe profile. Do not use the default personal Chrome profile for manual testing.

## Snapshot example

```powershell
node .\ems-measure.mjs snapshot --port 9222 --profile-dir "C:\Users\...\Profile 4" --out .\snapshots\baseline.json
```

## Diff example

```powershell
node .\ems-measure.mjs diff .\snapshots\baseline.json .\snapshots\after.json
```

## Benchmark export example

Use this after a clean A/B removal run to generate popup-import JSON.

```powershell
node .\ems-measure.mjs export-labels `
  .\snapshots\yt3-baseline.json `
  .\snapshots\yt3-after-darkreader.json `
  --source youtube-3ext-scenario `
  --out .\docs\generated-darkreader-label.json
```

If the output file already exists, `export-labels` merges the new `extensions` entry into the existing JSON map.

## Multi-scenario catalog example

Use `build-catalog` when you already have a scenario spec file.

```powershell
node .\ems-measure.mjs build-catalog `
  .\docs\youtube-benchmark-scenarios.json `
  --out .\docs\generated-youtube-benchmark-labels.json
```

Example spec file:

- `docs/youtube-benchmark-scenarios.json`

`build-catalog` now supports a less-manual spec flow:

- if one extension target disappears in the `after` snapshot, the scenario can omit selectors entirely
- if the diff is ambiguous, add one of:
  - `extensionId`
  - `extensionName`
  - `extensionNameContains`

Minimal spec example:

```json
{
  "source": "youtube-3ext-scenario",
  "scenarios": [
    {
      "before": "../snapshots/yt3-baseline.json",
      "after": "../snapshots/yt3-after-darkreader.json"
    }
  ]
}
```

## Scenario discovery example

Use `discover-scenarios` when you have one baseline snapshot plus a folder of after snapshots and want to generate a `build-catalog` spec automatically.

```powershell
node .\tools\ems-measure.mjs discover-scenarios `
  .\snapshots\yt3-baseline.json `
  .\snapshots `
  --after-prefix yt3-after- `
  --source youtube-3ext-scenario `
  --out .\docs\youtube-benchmark-scenarios.json
```

The command scans JSON files in the after-snapshot folder, keeps diffs where exactly one extension target disappeared, records the inferred extension id/name, and writes a stable spec file for `build-catalog`.

Generated catalog entries include structured `metrics` such as `totalPrivateDropBytes`, `rendererPrivateDropBytes`, `extensionRendererPrivateDropBytes`, and `targetDelta`. The popup surfaces these as measured memory impact values. They are scenario A/B deltas, not exact live ownership totals.

## Manifest-only profile inventory

Use this when you need relevance metadata that stable `chrome.management.ExtensionInfo` does not expose in the popup, especially `optional_host_permissions` and `content_scripts.matches`:

```powershell
.\tools\Export-EMSProfileInventory.ps1 -ProfileDir "<TEST_PROFILE_DIR>"
```

This wrapper writes `test-results\profile-inventory.json` by default and calls `profile-inventory` underneath. The underlying command reads only a test/probe profile on disk and does not launch or mutate Chrome. Treat the output as a development/probe enrichment source, not as runtime stable-extension API data.

The popup `Import JSON` button accepts this output and stores the manifest signals separately from benchmark labels. Imported `content_scripts.matches` can upgrade a row to `content script match`; imported `optional_host_permissions` can show `optional host match` when it matches the current site.

## Current label mapping rule

`export-labels` maps a scenario to `low` / `medium` / `high` using:

`max(totalPrivateDrop, rendererPrivateDrop)`

Thresholds:

- `high`: `>= 60 MB`
- `medium`: `>= 25 MB`
- `low`: `>= 8 MB`
- otherwise `unknown`

This is still scenario guidance, not live truth.

## What to look at

- `extensionSummaries[*].ownedPrivateBytes`
- `extensionSummaries[*].ownedWorkingSet`
- `chromeProcesses[*].commandLine`
- `systemProcessInfo[*].type`

## Known limitations

- Content scripts live inside renderer processes and are not directly attributable on stable Chrome.
- Process command lines do not always expose extension ids.
- Shared renderer processes can blur ownership.
- Mutating a copied profile to disable one extension can cause other extension targets to disappear too, so A/B isolation must be verified on every run.
- The best final estimate usually comes from:

`extension owned process bytes + A/B renderer delta`
