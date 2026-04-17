# EMS Roadmap Review (2026-04-17)

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

### Partially done

- site relevance inference
  - implemented:
    - saved site profiles
    - host permission matching
    - hostname/name/description heuristics
  - still missing from the original spec:
    - explicit handling of `optional_host_permissions`
    - explicit handling of `content_scripts.matches`
- benchmark workflow integration
  - implemented:
    - import UI
    - seeded local catalog
    - compact benchmark export command from the probe workflow
    - documented mapping rule from measured deltas to `low/medium/high`
    - multi-scenario catalog build command with JSON scenario spec
    - auto-selection when a scenario removes exactly one extension target
    - optional `extensionName` / `extensionNameContains` selectors for ambiguous scenarios
  - still missing:
    - smoother scenario authoring for richer metadata beyond current selectors
- end-to-end verification
  - manual verification happened on the real YouTube page
  - automated regression verification is still missing

### Not done yet

- broader handling for remaining Chrome management edge cases
  - user-facing explanation for enterprise/managed-extension constraints
  - clearer separation between "saved setup changed nothing" and "Chrome refused part of the request"
  - more explicit treatment of tabs that should be inventory-only, not actionable
- packaged icons and store-ready metadata
- release-oriented UI pass
  - current UI works, but layout density and section sizing still need a deliberate cleanup pass
- docs for non-technical use
  - right now the product is understandable for a builder, not yet for a normal end user

## Recommended next priorities

### Priority 1

Close the remaining MVP-spec gaps:

- support `optional_host_permissions` in relevance scoring where available
- investigate whether `content_scripts.matches` can be surfaced reliably enough for inference
- keep reducing manual scenario authoring for richer datasets

### Priority 2

Make the extension safer and easier to trust:

- add a small help/state explainer section
- make destructive-feeling actions more obvious about being browser-wide
- add automated popup verification once a working Playwright path exists

### Priority 3

Prepare for a cleaner handoff/release cycle:

- add icons and basic metadata
- add a simple automated verification path
- do one deliberate UI polish pass after behavior stabilizes

## Decision

Behavior work should stay ahead of UI polish.

The next concrete implementation step should be:

1. make scenario authoring and catalog generation less manual
2. stronger relevance inference from additional metadata
3. add a lightweight help/trust explainer without growing the popup too much
