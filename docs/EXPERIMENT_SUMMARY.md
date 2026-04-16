# Experiment Summary

## Latest measured run

Scenario:

- Windows 11
- Google Chrome Stable
- Cloned `Profile 4`
- Target site: `https://docs.google.com/document/u/0/`
- A/B mutation: remove `Google Docs Offline` from the copied profile

Observed diff summary:

- total private bytes: `395.93 MB -> 350.12 MB`
- total working set: `752.01 MB -> 709.69 MB`
- renderer private: `162.91 MB -> 90.82 MB`
- renderer working set: `357.19 MB -> 198.07 MB`
- extension-renderer private: `79.63 MB -> 19.09 MB`
- extension targets: `31 -> 1`
- process count: `39 -> 12`

## Interpretation

The harness is working at the session-diff level.

The result is not a clean single-extension attribution result.

Removing one copied-profile extension caused many unrelated extension targets to disappear too, so this run should be used only as directional evidence that:

- session-level A/B measurement is feasible
- renderer-focused delta is informative
- stable Chrome still does not provide trustworthy per-extension total memory

## Current blocker

The copied-profile mutation path is too coarse.

We need a cleaner isolation method so one extension can be added or removed without collapsing unrelated extension targets.

## Next recommended experiment

1. Create a minimal probe profile instead of mutating a heavy real profile clone.
2. Load only a small allowlist of target extensions into that probe profile.
3. Re-run the same URL across:
   - baseline
   - target extension enabled
   - target extension removed
4. Compare:
   - total session delta
   - renderer delta
   - extension-renderer delta
   - non-extension renderer delta

## Confidence level

- Tooling confidence: medium-high
- Per-extension truth confidence: low
- Session-level direction confidence: medium
