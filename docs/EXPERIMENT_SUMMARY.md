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

## Updated measured run

Scenario:

- Windows 11
- Google Chrome Stable
- Test profile rebuilt into a non-default probe clone so remote debugging would work
- Target URL: `https://www.youtube.com/watch?v=pa4Xo-LQe54`
- Focused extension set:
  - `Dark Reader`
  - `Bideo Max: Auto 8K/4K/HD for YouTube & More`
  - `'Improve YouTube!'`

Baseline:

- extension targets: `4`
- chrome processes: `14`

Clean A/B results:

1. Remove `Dark Reader`
   - extension targets: `4 -> 3`
   - total private: `337.22 MB -> 283.08 MB`
   - renderer private: `183.63 MB -> 128.99 MB`
   - extension-renderer private: `45.83 MB -> 15.52 MB`

2. Remove `Bideo Max`
   - extension targets: `4 -> 3`
   - total private: `337.22 MB -> 264.50 MB`
   - renderer private: `183.63 MB -> 122.04 MB`
   - extension-renderer private: `45.83 MB -> 74.38 MB`

3. Remove `Improve YouTube`
   - extension targets: `4 -> 3`
   - total private: `337.22 MB -> 264.08 MB`
   - renderer private: `183.63 MB -> 104.30 MB`
   - extension-renderer private: `45.83 MB -> 52.55 MB`

Interpretation:

- The test harness is now working reliably for a focused 3-extension YouTube scenario.
- Direct per-extension owned-process memory is still unavailable on stable Chrome.
- Session and renderer deltas are usable, but extension-renderer deltas can still move counterintuitively because renderer allocation is shared and timing-sensitive.

Key implementation note:

- Launching Chrome against the default `User Data` path can leave the DevTools endpoint unreachable even when `--remote-debugging-port` is passed.
- The reliable workaround is to copy the profile into a non-default probe directory and launch Chrome from that clone.
