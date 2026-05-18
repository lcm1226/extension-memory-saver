# EMS Desktop 사용법

## 현재 상태

EMS Desktop은 Chrome 확장 프로그램별 메모리 사용량을 정확한 소유권 기준으로 표시하는 앱이 아닙니다.

대신 선택한 probe Chrome 프로필을 안전하게 복제한 뒤, 같은 페이지에서 확장 프로그램을 하나씩 제외한 A/B 측정을 실행해 대략적인 메모리 영향값을 보여줍니다.

예: `AdBlock을 빼면 이 페이지 세션 메모리가 약 40 MB 줄었다`.

## 포터블 실행

배포 패키지를 받은 경우:

1. `EMS-Desktop-Portable` 폴더를 엽니다.
2. `Start EMS Desktop.cmd`를 더블클릭합니다.
3. 앱에서 `Launch Probe Chrome`을 누릅니다.
4. 열린 probe Chrome에 측정할 확장 프로그램을 설치하거나 켭니다.
5. probe Chrome에서 측정할 웹사이트를 엽니다.
6. EMS Desktop에서 `Refresh Browsers`를 누르고 해당 브라우저를 선택합니다.

## 개발 환경에서 실행

repo 폴더 안에서 실행:

```powershell
cd "C:\Users\lcmru\Desktop\Codex Draft\ems-memory-probe"
npm run desktop:run
```

어느 위치에서든 실행:

```powershell
npm --prefix "C:\Users\lcmru\Desktop\Codex Draft\ems-memory-probe" run desktop:run
```

또는 helper 스크립트:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\lcmru\Desktop\Codex Draft\ems-memory-probe\tools\Start-EMSDesktop.ps1"
```

## 측정 흐름

1. 앱이 debug-enabled Chromium/Chrome 브라우저를 찾습니다.
2. 선택한 브라우저의 현재 활성 HTTP(S) 페이지를 기준으로 측정합니다.
3. 최근 캐시가 있으면 먼저 즉시 보여줍니다.
4. 백그라운드에서 profile clone을 만들고 headless worker로 새 측정을 실행합니다.
5. headless 측정이 실패하면 off-screen headful worker로 재시도합니다.
6. 측정이 끝나면 결과 테이블이 새 값으로 갱신됩니다.

선택한 실제 probe profile은 직접 수정하지 않습니다. 확장 비활성화 실험은 clone profile에서만 수행합니다.

## 명령줄로 probe Chrome 실행

```powershell
.\tools\Start-EMSDesktopProbeChrome.ps1 -Url "https://www.youtube.com/"
```

이 명령은 repo 내부 `.tmp\ems-desktop-probe-user-data`에 별도 Chrome 프로필을 만들고 `--remote-debugging-port=9222`로 실행합니다.

## 결과 해석

- `Approx. impact`: baseline 대비 해당 확장을 제외했을 때 줄어든 대략적인 private memory delta입니다.
- `Confidence: medium`: 다른 확장 target 변화가 거의 없거나 오염이 낮은 run입니다.
- `Confidence: low`: 다른 확장 target도 같이 변했거나 session-level delta 의존도가 큰 run입니다.
- `Source: cached`: 이전 측정값을 먼저 보여준 상태입니다.
- `Source: measured`: 백그라운드 측정이 끝난 새 결과입니다.
- `Worker: headless/offscreen`: 측정에 사용된 clone Chrome 실행 방식입니다.

## 한계

- Stable Chrome은 content script renderer memory를 확장 프로그램별로 정확히 나누어 주지 않습니다.
- 값은 페이지 상태, 광고, 영상 재생 여부, 캐시, 네트워크 상태에 따라 흔들릴 수 있습니다.
- 확장이 많으면 후보 확장 수만큼 clone Chrome 측정이 필요해 시간이 걸릴 수 있습니다.

## 개발 검증 명령

```powershell
npm run desktop:list
npm run desktop:build
npm run desktop:package
npm run test:e2e
```
