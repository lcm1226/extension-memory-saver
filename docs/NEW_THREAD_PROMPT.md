# New Thread Prompt

Use this when continuing EMS in a brand-new Codex thread after moving or copying the repo.

```text
This repo is the transfer unit for EMS. Read `HANDOFF.md`, `docs/FOLDER_MOVE_HANDOFF.md`, `docs/ROADMAP_REVIEW_2026-04-17.md`, and `docs/STORE_RELEASE_PREP.md` first, in that order.

Before changing code:
1. run `npm install`
2. run `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`
3. run `npm run test:e2e`; the script sets `PLAYWRIGHT_BROWSERS_PATH=0`
4. if release-facing files changed, run `npm run package:extension` and inspect the ZIP contents

Project invariants:
- stable Chrome still does not expose reliable live per-extension total memory
- EMS can import near-live external probe estimates, but it is not an exact in-extension memory ownership meter
- keep browser-wide action messaging explicit
- preserve the current Playwright coverage and extend it before asking for more manual verification

Continue from the current branch and current HEAD. Treat `docs/ROADMAP_REVIEW_2026-04-17.md` as the source of truth for remaining work and `docs/STORE_RELEASE_PREP.md` as the source for store-submission assets/copy.

When reporting back:
- say what you verified locally before editing
- keep the repo portable across folder moves
- update `HANDOFF.md` and the roadmap review if priorities or completed work change
```
