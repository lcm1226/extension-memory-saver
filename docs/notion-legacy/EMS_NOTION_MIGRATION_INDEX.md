# EMS Notion Legacy Migration Index

Migrated on: 2026-05-06
Legacy title prefix applied in Notion on: 2026-05-06

This folder is the local/GitHub transfer point for EMS-related Notion material. The active source of truth remains the repo implementation and current docs; these files preserve the old Notion planning context after the Notion items were marked as legacy with a `####` title prefix.

## Current Source Of Truth

- `README.md`
- `HANDOFF.md`
- `docs/ROADMAP_REVIEW_2026-04-17.md`
- `docs/EMS_MEASUREMENT.md`
- `docs/EMS_MVP_SPEC.md`
- `docs/STORE_RELEASE_PREP.md`
- `docs/HOW_TO_USE.ko.md`
- `docs/HOW_TO_USE.en.md`
- `tests/e2e/popup.spec.js`

## Migrated Notion Items

| Kind | Original title | Notion URL | Local status |
| --- | --- | --- | --- |
| hub-page | EMS | https://www.notion.so/3444e350008b811db369e6e1f5b0a123 | Archived in EMS_NOTION_LEGACY_ARCHIVE.md |
| draft-container-page | Draft | https://www.notion.so/3444e350008b8006a9ffe72ebc18f8f1 | Archived in EMS_NOTION_LEGACY_ARCHIVE.md |
| draft-page | Extension Memory Saver (EMS) Draft | https://www.notion.so/2f09376a50814af2b2d9e8b0b1df5e9c | Superseded by docs/EMS_MVP_SPEC.md, docs/EMS_MEASUREMENT.md, and docs/ROADMAP_REVIEW_2026-04-17.md |
| handoff-page | 작업 이어서 - EMS | https://www.notion.so/3454e350008b809e9110ded562223e88 | Superseded by HANDOFF.md, docs/FOLDER_MOVE_HANDOFF.md, docs/NEW_THREAD_PROMPT.md, and this archive |
| roadmap-project | EMS - Chromium Extension Control Panel | https://www.notion.so/3444e350008b81f892d4cb1c2895b75e | Superseded by docs/ROADMAP_REVIEW_2026-04-17.md and docs/STORE_RELEASE_PREP.md |
| roadmap-stage | EMS Stage 0 - API Feasibility Spike | https://www.notion.so/3444e350008b816b8ca1e7f1d3e201aa | Archived as legacy roadmap stage |
| roadmap-stage | EMS Stage 1 - Inventory UI MVP | https://www.notion.so/3444e350008b813e83f1c7aeaf4d33c2 | Archived as legacy roadmap stage |
| roadmap-stage | EMS Stage 2 - Toggle and Restore | https://www.notion.so/3444e350008b81a897cbdbbdf594efcf | Archived as legacy roadmap stage |
| roadmap-stage | EMS Stage 3 - Presets | https://www.notion.so/3444e350008b813a9353f42be672efb0 | Archived as legacy roadmap stage |
| roadmap-stage | EMS Stage 4 - Validation | https://www.notion.so/3444e350008b811da894c3ac320e69f0 | Archived as legacy roadmap stage |
| roadmap-stage | EMS Stage 5 - Advanced Measurement R&D | https://www.notion.so/3444e350008b813fb13cdc82b52240f9 | Archived as legacy roadmap stage |
| todo | EMS capability matrix 작성 | https://www.notion.so/3444e350008b81f8b6b4ce5fb443bb8a | Archived as legacy todo |
| todo | EMS Dev/Canary 측정 경로 조사 | https://www.notion.so/3444e350008b81829a22f3a963ddc0f5 | Archived as legacy todo |
| todo | EMS Windows OS-level 측정 워크플로 설계 | https://www.notion.so/3444e350008b81e4a2f0c90ae949db9d | Archived as legacy todo; current implementation lives in tools/ems-measure.mjs and docs/EMS_MEASUREMENT.md |
| todo | EMS Lite MVP 범위 고정 | https://www.notion.so/3444e350008b8161a994c2a6d8cd691c | Archived as legacy todo; current product stance lives in README.md and docs/EMS_MVP_SPEC.md |
| todo | EMS Inventory UI 초안 설계 | https://www.notion.so/3444e350008b8147a963dcd158b1d5cb | Archived as legacy todo; current implementation lives in ems-extension/ |
| todo | EMS Snapshot/Restore 데이터 모델 설계 | https://www.notion.so/3444e350008b8177919bea20198ec6f8 | Archived as legacy todo; current behavior covered by popup and e2e tests |
| todo | EMS 검증 시나리오 및 로그 포맷 작성 | https://www.notion.so/3444e350008b816889d1d68376438c41 | Archived as legacy todo; current verification lives in tests/e2e and docs/TEST_PROFILE_SCENARIO.md |

## Legacy Marking Policy

- Do not delete Notion items automatically.
- Migrated EMS-related Notion titles have been prefixed with `#### ` so they are easy to review and manually delete/archive later.
- Generic container pages that are not EMS-specific, such as the top-level `Roadmap` or `AI 데이터`, are intentionally not marked.
- Roadmap database records use their database title properties: `Project`, `Stage`, or `Task`.

## Local Files

- `EMS_NOTION_LEGACY_ARCHIVE.md`: consolidated planning archive.
- `ems-notion-legacy-items.json`: machine-readable inventory and Notion update plan.
