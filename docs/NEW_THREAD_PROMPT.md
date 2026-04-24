# New Thread Prompt

Use this when continuing EMS in a brand-new Codex thread after moving or copying the repo.

```text
This repo is the transfer unit for EMS. Read `HANDOFF.md`, `docs/FOLDER_MOVE_HANDOFF.md`, and `docs/ROADMAP_REVIEW_2026-04-17.md` first, in that order.

Before changing code:
1. run `npm install`
2. run `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`
3. run `npm run test:e2e`

Project invariants:
- stable Chrome still does not expose reliable live per-extension total memory
- EMS is a benchmark-backed extension control panel, not a live memory meter
- keep browser-wide action messaging explicit
- preserve the current Playwright coverage and extend it before asking for more manual verification

Continue from the current branch and current HEAD. Treat `docs/ROADMAP_REVIEW_2026-04-17.md` as the source of truth for remaining work.

When reporting back:
- say what you verified locally before editing
- keep the repo portable across folder moves
- update `HANDOFF.md` and the roadmap review if priorities or completed work change
```
