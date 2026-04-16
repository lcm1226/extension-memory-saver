# EMS Memory Probe

Windows-first measurement harness for Chromium extension memory experiments.

## Current scope

- Capture Chrome DevTools Protocol targets from a remote debugging port
- Capture live `chrome.exe` memory from Windows
- Resolve extension ids to profile-installed extension names and versions
- Compare two snapshots and summarize session-level deltas

## Repo layout

- `tools/ems-measure.mjs`: snapshot and diff CLI
- `tools/Start-EMSProbeChrome.ps1`: helper to launch Chrome with a probe profile
- `docs/EMS_MEASUREMENT.md`: operating notes and limitations
- `docs/EXPERIMENT_SUMMARY.md`: latest real-world run and its interpretation
- `HANDOFF.md`: concise context for continuing work in another Codex environment

## Current conclusion

Stable Chrome can support:

- extension target discovery
- session-level A/B memory comparison
- renderer delta analysis

Stable Chrome cannot yet support:

- reliable per-extension owned memory totals
- clean attribution of content-script memory
- tab-scoped extension disable control

## Immediate next steps

1. Improve A/B isolation so disabling one extension does not collapse unrelated extension targets.
2. Add renderer-focused diff output to separate extension-process renderers from ordinary page renderers.
3. Evaluate a Dev/Canary path with `chrome.processes` for stronger direct attribution.

## User actions for cloud handoff

1. Put this repo on a remote Git host if you want Cloud Codex to resume with full history.
2. If a remote is not available, carry `HANDOFF.md` and `docs/EXPERIMENT_SUMMARY.md` into the next session.
3. If you want more measurement runs, prepare one or two target extensions you care about most so the next experiments stay narrow.
