# EMS Desktop How To Use

## Current Status

EMS Desktop does not claim exact per-extension memory ownership in Chrome.

It safely clones the selected probe Chrome profile, loads the same page, removes one extension at a time inside the clone, and reports the approximate A/B memory delta.

Example: `Removing AdBlock reduced this page session by about 40 MB`.

## Portable Run

If you received the portable package:

1. Open the `EMS-Desktop-Portable` folder.
2. Double-click `EMS Desktop.exe`. `Start EMS Desktop.cmd` is a compatibility launcher.
3. In the app, click `Launch Probe Chrome`.
4. Install or enable the extensions you want to measure in that probe Chrome.
5. Open the target website in the probe Chrome.
6. In EMS Desktop, click `Refresh Browsers` and select that browser.

## Development Run

From the repo folder:

```powershell
cd "C:\Users\lcmru\Desktop\Codex Draft\ems-memory-probe"
npm run desktop:run
```

From any folder:

```powershell
npm --prefix "C:\Users\lcmru\Desktop\Codex Draft\ems-memory-probe" run desktop:run
```

Or use the helper script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\lcmru\Desktop\Codex Draft\ems-memory-probe\tools\Start-EMSDesktop.ps1"
```

## Measurement Flow

1. The app discovers debug-enabled Chromium/Chrome browsers.
2. The selected browser's active HTTP(S) page becomes the measurement target.
3. Recent cached results are shown immediately when available. You can enable `Median x3` to run three A/B samples per extension and show the median value.
4. A background worker clones the profile and runs a headless measurement.
5. If headless capture fails, EMS retries with an off-screen headful worker.
6. The results table updates when the new measurement completes.

The selected live probe profile is not modified. Extension disabling happens only in cloned profiles.

## Launch Probe Chrome From CLI

```powershell
.\tools\Start-EMSDesktopProbeChrome.ps1 -Url "https://www.youtube.com/"
```

This creates a separate Chrome profile under `.tmp\ems-desktop-probe-user-data` and launches it with `--remote-debugging-port=9222`.

## Reading Results

- `Approx. impact`: approximate private-memory delta after removing that extension from the baseline clone.
- `Confidence: medium`: little or no unrelated extension target-count contamination was observed.
- `Confidence: low`: other extension targets changed, or the result depends heavily on session-level delta.
- `Source: cached`: a previous result was shown immediately.
- `Source: measured`: a background refresh completed.
- `Worker: headless/offscreen`: clone Chrome execution mode used for the measurement.

## Limits

- Stable Chrome does not expose exact content-script renderer ownership by extension.
- Values can vary with page state, ads, video playback, cache, and network conditions.
- More extensions means more clone Chrome runs, so refresh can take longer. `Median x3` is slower because it triples the sample count per extension.

## Developer Verification

```powershell
npm run desktop:list
npm run desktop:build
npm run desktop:package
npm run test:e2e
```
