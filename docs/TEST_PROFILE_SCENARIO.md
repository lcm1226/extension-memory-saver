# Test Profile Measurement Scenario

## Goal

Validate the EMS measurement harness on a clean test Chrome profile with exactly three installed extensions. All EMS manual/browser verification should stay on this kind of dedicated test profile, not the default personal Chrome profile.

This run is for harness verification first, not for final per-extension truth claims.

## Preconditions

- Repository branch: `spike/profile-clone-renderer-delta`
- Windows environment
- Google Chrome Stable installed
- Test Chrome profile already created
- Exactly three extensions installed in that test profile

## Inputs the operator must provide

1. The Chrome profile directory path for the test profile
2. The names and extension ids of the three installed extensions
3. One target URL to use for all runs

Recommended target URL choices:

- `https://github.com`
- `https://docs.google.com/document/u/0/`
- `https://www.youtube.com`

Use only one URL for one experiment cycle.

## Measurement plan

### Run 1: Profile inventory

Objective:

- confirm the harness can resolve the three installed extensions by name and id

Command pattern:

```powershell
node .\tools\ems-measure.mjs snapshot --port 9222 --profile-dir "<TEST_PROFILE_DIR>" --out .\snapshots\test-profile-inventory.json
node .\tools\ems-measure.mjs profile-inventory --profile-dir "<TEST_PROFILE_DIR>" --out .\test-results\profile-inventory.json
```

Pass condition:

- `extensionSummaries` shows the expected installed extensions

### Run 2: Baseline on target URL

Objective:

- measure the full session with all three test extensions enabled

Steps:

1. Launch Chrome with the test profile on a dedicated debugging port.
2. Open only the chosen target URL.
3. Wait for the page to settle.
4. Capture a snapshot.

Command pattern:

```powershell
.\tools\Start-EMSProbeChrome.ps1 -ProfileDir "<TEST_PROFILE_ROOT>" -Port 9222 -Url "<TARGET_URL>"
Start-Sleep -Seconds 8
node .\tools\ems-measure.mjs snapshot --port 9222 --profile-dir "<TEST_PROFILE_DIR>" --out .\snapshots\test-profile-baseline.json
```

Pass condition:

- snapshot completes
- Chrome process list is populated
- extension targets are visible when present

### Run 3: Single-extension removal A/B

Objective:

- estimate session delta when one chosen extension is removed from the test profile

Rules:

- remove only one extension at a time
- keep the same target URL
- do not add extra tabs

Steps:

1. Pick one of the three extensions as the target.
2. Disable or remove only that extension in the test profile.
3. Re-run the same URL and capture `after`.
4. Run diff against baseline.

Command pattern:

```powershell
node .\tools\ems-measure.mjs snapshot --port 9222 --profile-dir "<TEST_PROFILE_DIR>" --out .\snapshots\test-profile-after-one-removed.json
node .\tools\ems-measure.mjs diff .\snapshots\test-profile-baseline.json .\snapshots\test-profile-after-one-removed.json
```

What to inspect:

- total private bytes delta
- renderer private delta
- extension-renderer private delta
- extension target count delta
- removed extension target names

### Run 4: Repeat for the other two extensions

Objective:

- get three comparable A/B results, one per extension

Rules:

- restore the previous extension before testing the next one
- keep the same target URL and waiting time

## Interpretation rules

- Treat `ownedPrivateBytes` as strong evidence only when the process command line exposes the extension id.
- Treat renderer delta as an estimate, not direct proof.
- If removing one extension causes other unrelated extension targets to disappear, mark the run as contaminated.
- A contaminated run is still useful for tooling validation, but not for extension-level ranking.

## Success criteria

This scenario is successful if:

1. the harness resolves the three installed extensions correctly
2. baseline and after snapshots are both captured without errors
3. diff output changes in the expected direction when one extension is removed
4. at least one run is clean enough that only the target extension disappears from extension targets

## Recommended Cloud Codex prompt

Attach this file and `HANDOFF.md`, then use a prompt like this:

> This repo is already prepared on branch `spike/profile-clone-renderer-delta`. Follow `docs/TEST_PROFILE_SCENARIO.md` and `HANDOFF.md`. Use my test Chrome profile with three installed extensions, run the scenario step by step, tell me exactly what local inputs you need first, and do not widen the experiment scope beyond this scenario unless blocked.
