# EMS Notion Legacy Archive

Migrated on: 2026-05-06
Legacy title prefix applied in Notion on: 2026-05-06

This archive consolidates EMS planning material previously stored in Notion. It is intentionally marked as legacy: the repo docs and code are now the source of truth.

## Migration Boundary

Migrated:

- EMS draft and draft container page.
- EMS hub page.
- EMS handoff/checkpoint page and its checkpoint thread summary.
- Roadmap Projects record for `EMS - Chromium Extension Control Panel`.
- Roadmap Stages records for EMS Stage 0-5.
- Todo Tracker records linked to the EMS roadmap project.

Not migrated as EMS-specific legacy:

- Top-level `Roadmap` page, because it is a shared container.
- Top-level `AI 데이터` page, because it is a shared workspace container.
- Non-EMS pages that appeared only because of generic words like "memory" or "extension".

## Original Draft Summary

Source: https://www.notion.so/2f09376a50814af2b2d9e8b0b1df5e9c

The original EMS request was not feasible as written under public stable Chromium extension APIs:

- A Chrome extension cannot reliably list which other extensions are actively running in the current tab.
- It cannot read exact per-extension or per-tab memory usage for other extensions.
- It cannot disable another extension only for one tab through public APIs.

Recommended product direction from the draft:

- Ship EMS as a site-aware extension control panel, not a live memory ownership meter.
- Use `chrome.management` for installed extension inventory and browser-wide enable/disable where allowed.
- Rank likely site relevance using current URL, host permissions, homepage, names/descriptions, imported profile inventory, and saved site profiles.
- Treat memory numbers as benchmark-backed or external-probe estimates with explicit confidence labels.

Measurement paths evaluated in the draft:

- Chrome Dev/Canary `chrome.processes`: closest browser-internal option, but not a stable Web Store MVP base and still weak for content-script ownership.
- Remote debugging + OS process memory: practical external probe path, now implemented through `tools/ems-measure.mjs live-estimates`.
- A/B differential measurement: useful for scenario benchmark impact labels.
- Windows tools such as Performance Analyzer, Process Explorer, VMMap, and process memory APIs: useful for process memory, not direct extension ownership without mapping.
- MemoryInfra/tracing/heap profiling: high-effort R&D only.

## Roadmap Project Snapshot

Source: https://www.notion.so/3444e350008b81f892d4cb1c2895b75e

- Project: EMS - Chromium Extension Control Panel
- Status at Notion migration: Active
- Priority: High
- Target date: 2026-05-31
- Original success metric: validate at least one repeatable per-extension measurement workflow and define a shippable MVP boundary.
- Project split: measurement track plus product track.
- Current repo state: the shippable MVP boundary is implemented as a benchmark-backed extension control panel with optional external near-live estimates. Store Release prep has started.

## Stage Snapshot

| Order | Stage | Notion status | Notes | Deliverables |
| --- | --- | --- | --- | --- |
| 0 | EMS Stage 0 - API Feasibility Spike | In Progress | Confirm public API boundaries and separate impossible requirements from feasible MVP scope. | Capability matrix; impossible-items memo; MVP scope boundary |
| 1 | EMS Stage 1 - Inventory UI MVP | In Progress | Build a current-site-oriented extension inventory UI with clear attribution limits. | Entry surface; inventory list; filtering/warnings; popup layout; benchmark wording; shortcut policy |
| 2 | EMS Stage 2 - Toggle and Restore | Planned | Enable fast disable/restore workflows for heavy extension sets. | Toggle actions; snapshot persistence; restore flow |
| 3 | EMS Stage 3 - Presets | Planned | Add work-mode presets such as Research, Docs, Video, and Focus. | Preset schema; apply/restore flow; recommendation hints |
| 4 | EMS Stage 4 - Validation | Planned | Validate actual impact with repeatable measurement and user scenarios. | Test scenarios; logging format; comparison reports |
| 5 | EMS Stage 5 - Advanced Measurement R&D | Planned | Investigate Dev/Canary, remote debugging, OS-level memory tools, and attribution quality. | R&D workflow candidates; no-go criteria; recommendation memo |

## Todo Snapshot

| Task | Notion status | Priority | Effort | Area | Stage | Archived content |
| --- | --- | --- | --- | --- | --- | --- |
| EMS capability matrix 작성 | In Progress | High | M | Codex | Stage 0 | chrome.management, chrome.processes, impossible requirements, measurement/product track split |
| EMS Dev/Canary 측정 경로 조사 | Backlog | High | L | Research | Stage 5 | browser channel dependency, available memory metrics, attribution quality limits |
| EMS Windows OS-level 측정 워크플로 설계 | In Progress | High | L | Research | Stage 5 | Probe clone, YouTube 3-extension scenario, export-labels/build-catalog, stable Chrome direct totals unavailable |
| EMS Lite MVP 범위 고정 | Done | High | M | Codex | Stage 0 | MVP is site-aware extension control panel, not live memory meter |
| EMS Inventory UI 초안 설계 | In Progress | Medium | M | Codex | Stage 1 | Popup shell, relevance, save/apply/restore/import, Playwright, handoff docs, scenario discovery |
| EMS Snapshot/Restore 데이터 모델 설계 | Backlog | Medium | M | Codex | Stage 2 | Snapshot structure, restore conflict handling, safelist exceptions |
| EMS 검증 시나리오 및 로그 포맷 작성 | Backlog | Medium | M | Research | Stage 4 | 30/50/80 tab scenarios, before/after table, false positive/negative logging |

## Windows Measurement Notes Preserved From Notion

Source: https://www.notion.so/3444e350008b81e4a2f0c90ae949db9d

- Default Chrome `User Data` could ignore `--remote-debugging-port`; probe clone profiles were used to avoid that.
- YouTube focused 3-extension scenario covered Dark Reader, Bideo Max, and Improve YouTube.
- Baseline extension targets changed cleanly from 4 to 3 when each target extension was removed.
- Observed total/private and renderer/private drops supported benchmark-backed impact labels.
- `export-labels`, `build-catalog`, and later `discover-scenarios` converted probe output into popup-importable JSON.
- Stable Chrome direct owned memory remained unavailable; exact per-extension total memory should not be claimed.

## Product Scope Decision Preserved From Notion

Source: https://www.notion.so/3444e350008b8161a994c2a6d8cd691c

Decision:

- Shipped MVP is a site-aware extension control panel, not a live memory meter.
- Popup provides current-site relevance, enable/disable, save/apply/restore, benchmark labels, imported profile signals, and external probe memory estimates.

Must-have preserved:

- Current site display.
- Installed extension inventory.
- Relevance inference.
- Global enable/disable.
- Save current setup / restore previous state.
- Pinned extension support.

Non-goals preserved:

- Exact live per-extension memory.
- True tab-scoped disable.
- Automatic background optimization.

## Checkpoint Thread Summary

Source: https://www.notion.so/3454e350008b809e9110ded562223e88

| Date | Commit/checkpoint | Summary |
| --- | --- | --- |
| 2026-04-24 | d730750 | structured scenario-delta benchmark catalog/import/display; e2e passed |
| 2026-04-24 | f1a9d2e | row-level Measured Memory Impact UI; e2e passed |
| 2026-04-24 | b2ac8ba | profile-inventory command for manifest-only relevance signals; Profile 5 checked |
| 2026-04-28 | 23f2144 | profile-inventory JSON import into popup relevance scoring; e2e passed |
| 2026-04-28 | profile inventory flow | Export-EMSProfileInventory.ps1 and Korean/English how-to docs |
| 2026-04-28 | 1afc13c | enlarged popup extension list; e2e and layout probe passed |
| 2026-04-28 | 48eed5f | disabled extension row state; e2e and layout probe passed |
| 2026-04-28 | 4becebd | full popup scroll model for extension list; e2e and layout probe passed |
| 2026-04-28 | 02cc005 | Store Release final prep consolidated in roadmap |
| 2026-04-28 | 7469311 | search/filter UX and confidence metadata; e2e passed |
| 2026-05-06 | 5a434a4 | Advanced R&D near-live memory estimates; live-estimates probe; e2e passed |
| 2026-05-06 | de05e55 | Store Release prep assets/icons/package script/docs; package and e2e passed |

## Current Post-Migration Interpretation

The Notion roadmap is now legacy planning history. Current execution should continue from:

- `docs/ROADMAP_REVIEW_2026-04-17.md` for remaining roadmap work.
- `docs/STORE_RELEASE_PREP.md` for store-submission work.
- `HANDOFF.md` and `docs/NEW_THREAD_PROMPT.md` for continuity.

Remaining high-level work after migration:

- Chrome Web Store screenshots from the dedicated test profile.
- Optional promo tiles.
- Final dashboard copy/privacy/permission review.
- Localization decision.
- Only then final UI polish if screenshots expose normal-user readability problems.
