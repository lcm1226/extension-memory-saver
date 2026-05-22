# EMS Desktop Companion How To Use

## Current Status

EMS Desktop estimates which Chrome extensions add memory cost on a page by safely measuring A/B deltas in cloned probe profiles. It does not mutate your live profile and does not claim exact Chrome memory ownership.

The Chrome extension remains a validated artifact and optional helper candidate. The desktop app is the primary measurement UX.

Example: `Removing AdBlock reduced this page session by about 40 MB`.

## Portable Run

If you received the portable package:

1. Open the `EMS-Desktop-Portable` folder.
2. Double-click `EMS Desktop.exe`. `Start EMS Desktop.cmd` is a compatibility launcher.
3. Choose `English` or `Korean` from the language selector near the top-right safe-clone badge.
4. In the app, click `Launch Probe Chrome`.
5. Install or enable the extensions you want to measure in that probe Chrome.
6. Open the target website in the probe Chrome.
7. In EMS Desktop, click `Refresh Profiles` and select that profile.

## Development Run

From the repo folder:

```powershell
cd "C:\Users\lcmru\Desktop\EMS\ems-memory-probe"
npm run desktop:run
```

From any folder:

```powershell
npm --prefix "C:\Users\lcmru\Desktop\EMS\ems-memory-probe" run desktop:run
```

Or use the helper script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\lcmru\Desktop\EMS\ems-memory-probe\tools\Start-EMSDesktop.ps1"
```

For the current local `Test` Chrome profile, seed the Probe Chrome profile first:

```powershell
npm run desktop:seed-profile5
```

This copies selected extension/profile state from Chrome `Profile 5` into `.tmp\ems-desktop-probe-user-data\Default`. The source profile is not modified.

## Measurement Flow

1. The app discovers Probe Chrome profiles. Advanced manually launched Chromium instances can also appear here.
2. The selected profile's active HTTP(S) page becomes the measurement target.
3. Recent cached results are shown immediately when available. You can enable `Median x3` to run three A/B samples per extension and show the median value.
4. A background worker clones the profile and runs a headless measurement.
5. If headless capture fails, EMS retries with an off-screen headful worker.
6. The results table updates when the new measurement completes.

The selected live probe profile is not modified. Extension disabling for measurement happens only in cloned profiles. Live control belongs to the optional Chrome extension helper: it can disable extensions with Chrome's `management` API, including a `Pause Site Extensions` action that targets current-site matches and arms auto-restore on tab close, origin change, or timer expiry. Chrome does not provide a stable page-only disable API, so helper actions are explicit browser-wide state changes with guardrails.

## Advanced: Launch Probe Chrome From CLI

```powershell
.\tools\Start-EMSDesktopProbeChrome.ps1 -Url "https://www.youtube.com/"
```

This creates a separate Chrome profile under `.tmp\ems-desktop-probe-user-data` and launches it with the DevTools endpoint EMS needs for measurement. Most users should prefer the app's `Launch Probe Chrome` button.

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
npm run desktop:seed-profile5
npm run desktop:verify-safety
npm run desktop:build
npm run desktop:package
npm run test:e2e
```
