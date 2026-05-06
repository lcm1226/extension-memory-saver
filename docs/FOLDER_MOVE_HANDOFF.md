# Folder Move Handoff

This repo is intended to be portable.

If the project folder moves to a new parent directory, machine, drive, or synced workspace, the goal is that copying the whole `ems-memory-probe` folder is enough to continue work.

## What to copy

Copy the whole repository folder:

- `ems-memory-probe/`
- include `.git/` if you want full branch and commit history

You do not have to carry `node_modules/`, Playwright browser downloads, or Chrome's unpacked-extension registration. Those can be recreated.

## After moving the folder

1. Open the repo from the new path.
2. If Git complains that the directory is unsafe, run:

```powershell
git config --global --add safe.directory "<new-path>"
```

3. Install repo dependencies:

```powershell
npm install
```

4. Install the Playwright browser used by the current test suite:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install chromium
```

5. Run the current regression suite. The npm script sets `PLAYWRIGHT_BROWSERS_PATH=0`, so the run uses the repo-local Playwright browser:

```powershell
npm run test:e2e
```

6. If you use the unpacked extension manually in Chrome, remove the old unpacked load and load `ems-extension/` again from the new path.
   Chrome stores unpacked-extension paths as absolute paths, so a moved folder will not keep working automatically in the browser UI.

## Read these files first

1. `HANDOFF.md`
2. `docs/ROADMAP_REVIEW_2026-04-17.md`
3. `docs/EMS_MEASUREMENT.md`
4. `docs/STORE_RELEASE_PREP.md`
5. `docs/NEW_THREAD_PROMPT.md`

## Current invariants

- stable Chrome still does not expose reliable live per-extension total memory
- EMS can import near-live external probe estimates, but it is not an exact in-extension memory ownership meter
- Playwright is the first verification gate before manual Chrome checks
- the repo should avoid depending on any old absolute workspace path

## Recommended smoke checks after the move

```powershell
node --check .\ems-extension\popup.js
node --check .\tests\e2e\popup.spec.js
npm run test:e2e
npm run package:extension
```

## If you continue in a new Codex thread

Use the prompt in `docs/NEW_THREAD_PROMPT.md` as the opener.
