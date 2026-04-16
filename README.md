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
3. Validate site profile actions and benchmark import/reset flow in the popup.

## Current MVP shell

The extension shell currently includes:

- popup with current site title and origin
- installed extension inventory from `chrome.management`
- site-relevance inference from host permissions and saved site profiles
- hostname + name/description heuristic relevance boosts for common sites
- global enable/disable actions
- save/restore current site setup
- apply/clear saved site setup for the current origin
- pinned extensions
- seeded benchmark labels for the validated YouTube scenario
- benchmark label import/reset controls

It does not yet include:

- polished error handling for all Chrome management edge cases
- packaged icons or store-ready metadata

## Local test

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `ems-extension` folder
5. Open a normal website and test the popup
6. If you want a custom shortcut, open `chrome://extensions/shortcuts`

## Shortcut note

The default popup shortcut is still `Ctrl+Shift+E`.

`Ctrl+D` is not a safe default because Chrome reserves it for bookmarking, so EMS should treat that binding as a manual user override only, not a shipped default.

## User actions for cloud handoff

1. Put this repo on a remote Git host if you want Cloud Codex to resume with full history.
2. If a remote is not available, carry `HANDOFF.md` and `docs/EXPERIMENT_SUMMARY.md` into the next session.
3. If you want more measurement runs, prepare one or two target extensions you care about most so the next experiments stay narrow.
