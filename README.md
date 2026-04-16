# EMS Memory Probe

Windows-first measurement harness for Chromium extension memory experiments.

## Current scope

- Capture Chrome DevTools Protocol targets from a remote debugging port
- Capture live `chrome.exe` memory from Windows
- Resolve extension ids to profile-installed extension names and versions
- Compare two snapshots and summarize session-level deltas

## Repo layout

- `ems-extension/`: Chrome extension MVP shell
- `tools/ems-measure.mjs`: snapshot and diff CLI
- `tools/Start-EMSProbeChrome.ps1`: helper to launch Chrome with a probe profile
- `docs/EMS_MEASUREMENT.md`: operating notes and limitations
- `docs/EXPERIMENT_SUMMARY.md`: latest real-world run and its interpretation
- `docs/EMS_MVP_SPEC.md`: buildable EMS product definition based on measurement findings
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

1. Load `ems-extension/` as an unpacked extension and verify popup behavior in Chrome.
2. Keep the Windows probe as a supporting benchmark workflow, not as the product itself.
3. Add import/export flow so benchmark results can drive extension impact labels.

## Current MVP shell

The extension shell currently includes:

- popup with current site title and origin
- installed extension inventory from `chrome.management`
- site-relevance inference from host permissions and saved site profiles
- global enable/disable actions
- save/restore current site setup
- pinned extensions

It does not yet include:

- benchmark label import UI
- polished error handling for all Chrome management edge cases
- packaged icons or store-ready metadata

## Local test

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `ems-extension` folder
5. Open a normal website and test the popup

## User actions for cloud handoff

1. Put this repo on a remote Git host if you want Cloud Codex to resume with full history.
2. If a remote is not available, carry `HANDOFF.md` and `docs/EXPERIMENT_SUMMARY.md` into the next session.
3. If you want more measurement runs, prepare one or two target extensions you care about most so the next experiments stay narrow.
