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
  - still missing:
    - multi-scenario catalog generation workflow
- end-to-end verification
  - manual verification happened on the real YouTube page
  - automated regression verification is still missing

### Not done yet

- polished handling for Chrome management edge cases
  - extensions that cannot be disabled
  - clearer handling when the current tab has no standard origin
  - more obvious no-op messaging for site setup actions
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
- turn the compact benchmark export into a smoother multi-scenario catalog workflow

### Priority 2

Make the extension safer and easier to trust:

- improve error and no-op states
- add a small help/state explainer section
- make destructive-feeling actions more obvious about being browser-wide

### Priority 3

Prepare for a cleaner handoff/release cycle:

- add icons and basic metadata
- add a simple automated verification path
- do one deliberate UI polish pass after behavior stabilizes

## Decision

Behavior work should stay ahead of UI polish.

The next concrete implementation step should be:

1. turn benchmark export into a smoother multi-scenario catalog workflow
2. stronger relevance inference from additional metadata
3. edge-case and trust-state handling
