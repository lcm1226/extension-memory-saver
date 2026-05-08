# EMS Roadmap Review (2026-04-17)

## Desktop Pivot Supersession

As of 2026-05-08, the active product direction is `EMS Desktop`, documented in `docs/EMS_DESKTOP_PIVOT_ROADMAP.md`.

This roadmap remains useful as the extension MVP and Chrome Web Store release audit, but new measurement-product work should prioritize the desktop app:

- clone-based A/B measured deltas instead of popup-imported benchmark JSON
- debug-enabled browser/profile discovery
- automatic sequential measurement after browser/profile selection
- GitHub/repo docs as source of truth, not Notion

The extension MVP is preserved as a validated artifact under `ems-extension/`.

## Summary

The popup MVP is now functionally useful.

Core user flows that were explicitly tested:

- current site detection
- site-relevant extension ranking on YouTube
- global enable/disable from the popup
- `Lighten This Site`
- `Save Current Setup`
- `Apply Saved Setup`
- `Restore Previous State`
- `Clear Saved Setup`
- benchmark JSON import
- benchmark reset to seeded defaults

The remaining work is no longer about basic feasibility. It is mostly about closing the gap between the written MVP spec and a release-ready extension.

## Status by roadmap area

### Done

- popup shell and current tab/origin display
- `chrome.management` extension inventory
- global enable/disable controls
- restore snapshot flow
- per-site saved setup flow
- pinning support
- benchmark label rendering
- benchmark JSON import/reset UI
- seeded YouTube benchmark catalog
- heuristic site relevance boosts for common sites
- clearer action feedback after user operations
- clearer no-op and protected-extension messaging
- safer action disabling when the current tab has no standard web origin
- lightweight help / trust explainer in the popup
- basic Playwright popup verification path
- verified inventory-only behavior on non-web tabs through Playwright and fixed `chrome://` opaque-origin handling
- verified protected/unavailable extension handling through a test-only management fixture
- added explicit browser-wide action banner and browser-wide/no-op status copy
- verified saved-setup conflict handling when protected states block part of `Apply Saved Setup`
- added folder-move / new-thread handoff docs so the repo can move without losing working context
- made `npm run test:e2e` resolve the repo-local Playwright browser after folder moves
- added `discover-scenarios` to generate catalog scenario specs from one baseline and a folder of after snapshots
- added structured scenario-delta memory metrics to benchmark catalog entries and row-level popup memory-impact display
- added `profile-inventory` for test/probe profile manifest signals (`optional_host_permissions`, `content_scripts.matches`)
- wired profile-inventory JSON import into popup relevance scoring
- added a lightweight `Export-EMSProfileInventory.ps1` wrapper and Korean/English how-to docs for the simplified development flow
- added extension list search and All/Relevant/Enabled/Disabled/Pinned filters
- added benchmark confidence metadata display for measured memory-impact rows
- added advanced `live-estimates` probe export for near-live per-extension memory estimates
- popup import/rendering now supports `memoryEstimates` with confidence and attribution metadata
- `live-estimates` scopes Windows Chrome processes to the provided probe profile when possible
- `live-estimates` adds low-confidence manifest site-match estimates for newly installed all-sites/site-specific extensions when direct targets are not observed
- added Store Release prep baseline: packaged icons, store-ready manifest metadata, release ZIP builder, listing copy draft, and permission/privacy rationale

### Partially done

- site relevance inference
  - implemented:
    - saved site profiles
    - host permission matching
    - hostname/name/description heuristics
    - homepage host matching
    - permission-based hints for browser-wide or tab-level capability
    - imported test/probe profile manifest signals for `content_scripts.matches` and `optional_host_permissions`
  - still missing from the original spec:
    - automatic runtime access to these manifest-only fields without explicit profile-inventory import
  - current constraint:
    - `chrome.management.ExtensionInfo` documents `hostPermissions`, `permissions`, and `homepageUrl`, but does not expose `optional_host_permissions` or `content_scripts.matches`, so stable public metadata still leaves a hard ceiling inside the runtime popup
  - latest probe-side progress:
    - `profile-inventory` can read `optional_host_permissions` and `content_scripts.matches` from a test/probe profile on disk
    - popup `Import JSON` can store those signals and use them for relevance scoring
- benchmark workflow integration
  - implemented:
    - import UI
    - seeded local catalog for the measured YouTube 3-extension scenario only: Dark Reader, Bideo Max, and Improve YouTube
    - compact benchmark export command from the probe workflow
    - documented mapping rule from measured deltas to `low/medium/high`
    - multi-scenario catalog build command with JSON scenario spec
    - scenario discovery command for one-baseline/many-after snapshot sets
    - auto-selection when a scenario removes exactly one extension target
    - optional `extensionName` / `extensionNameContains` selectors for ambiguous scenarios
  - still missing:
    - broader benchmark catalog coverage for newly installed or user-specific extensions beyond near-live low-confidence probe estimates
    - smoother scenario authoring for richer metadata beyond current discovered baseline/after datasets
  - current constraint:
    - new extensions can now receive near-live low-confidence estimates through `live-estimates`; higher-confidence measured impact still needs a clean benchmark JSON import or future catalog update
- end-to-end verification
  - manual verification happened on the real YouTube page
  - one Playwright smoke test now covers popup inventory metrics, relevance labeling, browser-wide trust banner copy, `Lighten This Site`, `Restore Previous State`, `Save Current Setup`, `Apply Saved Setup`, `Clear Saved Setup`, benchmark import/reset, help/trust copy, inventory-only behavior on non-web tabs, protected/unavailable bulk-action skips, and saved-setup conflict handling against protected states using mock extensions plus a test-only management fixture
  - broader regression coverage is still missing

### Not done yet

- exact live memory ownership remains unavailable on stable Chrome
  - current implemented R&D path: external debug-port `live-estimates` + Windows process memory + profile manifest heuristics
  - future R&D could still explore Dev/Canary `chrome.processes`, stronger PID mapping, and automated A/B calibration
  - do not present low-confidence shared/heuristic estimates as exact renderer ownership
- broader handling for remaining Chrome management edge cases
  - user-facing explanation for enterprise/managed-extension constraints
  - clearer separation between "saved setup changed nothing" and "Chrome refused part of the request"
  - more explicit treatment of tabs that should be inventory-only, not actionable
- Store Release final prep
  - done: packaged icons, store-ready manifest metadata, release ZIP builder, draft listing copy, permission/privacy explanation, and package checklist
  - remaining: Chrome Web Store screenshots, optional promo tiles, dashboard submission review, and Korean/English localization decision
  - remaining: one final release UI polish pass only if screenshot review exposes normal-user readability problems
  - remaining: non-technical docs can be expanded after the listing copy is finalized

## Recommended next priorities

### Priority 1

Close the remaining MVP-spec gaps:

- keep profile-inventory generation as an explicit test-profile-only step, now simplified through `Export-EMSProfileInventory.ps1`
- keep `live-estimates` as an explicit external probe step for near-live values until a safer packaged workflow exists
- keep reducing manual scenario authoring only when richer datasets need metadata beyond current discovery

### Priority 2

Store Release final prep:

- preserve and maintain the current popup verification breadth as behavior changes
- use `npm run package:extension` to verify the release ZIP whenever release-facing files change
- capture Chrome Web Store screenshots from the dedicated test profile
- create optional promo tiles only if the first submission needs them
- review final dashboard copy, permission/privacy text, and localization choice before submission
- do one deliberate release UI polish pass only if screenshot review shows readability problems

### Priority 3

Make the project easier to continue outside the current thread:

- keep the folder-move / new-thread handoff docs current as milestones change
- add non-technical docs once the behavior model stops moving

## Decision

Behavior work should stay ahead of UI polish.

The next concrete implementation step should be:

1. keep the lightweight profile-inventory export/import flow unless manual use shows it is still too clunky
2. finish the remaining Store Release manual assets and dashboard review now that packaged icons/metadata/ZIP tooling exist
3. expand benchmark catalog coverage only for extensions/sites that are actually worth measuring
