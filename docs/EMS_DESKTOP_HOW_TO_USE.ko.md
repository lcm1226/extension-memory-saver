# EMS Desktop 사용법

## 현재 상태

EMS Desktop은 Chrome 확장 프로그램별 메모리 "정확한 소유량"을 표시하는 앱이 아닙니다.

대신 선택한 Chromium/Chrome 프로필을 안전하게 복제한 뒤, 같은 페이지를 기준으로 확장을 하나씩 뺀 A/B 실행을 수행하고 대략적인 메모리 영향 값을 보여줍니다.

예: `AdBlock을 뺐을 때 이 페이지 세션 메모리가 약 40 MB 줄었다`.

## 빠른 실행

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

앱에서 할 일:

1. `Launch Probe Chrome`을 누릅니다.
2. 열린 Chrome 프로브 프로필에서 측정할 페이지를 엽니다.
3. 필요한 확장 프로그램을 그 프로브 프로필에 설치하거나 활성화합니다.
4. EMS Desktop에서 `Refresh Browsers`를 누릅니다.
5. 프로필을 선택하면 clone 기반 A/B 측정이 자동으로 시작됩니다.

## 명령줄로 프로브 Chrome 실행

```powershell
.\tools\Start-EMSDesktopProbeChrome.ps1 -Url "https://www.youtube.com/"
```

이 명령은 repo 내부 `.tmp\ems-desktop-probe-user-data`에 별도 Chrome 프로필을 만들고 `--remote-debugging-port=9222`로 실행합니다.

## 중요한 안전 원칙

- EMS Desktop은 선택된 live profile을 직접 수정하지 않습니다.
- 실제 A/B 측정은 `.tmp\desktop-runs\` 아래 clone profile에서 수행됩니다.
- clone에서만 확장 폴더를 `.DISABLED`로 바꿔서 측정합니다.
- `.tmp\`, snapshots, test-results, build output은 Git에 들어가지 않습니다.

## 왜 debug-enabled Chrome이 필요한가

이미 일반 방식으로 실행된 Chrome은 DevTools endpoint를 외부 앱에 노출하지 않습니다.

EMS Desktop은 다음 정보가 필요합니다:

- 현재 열린 페이지 URL/title
- Chrome target list
- Chrome process memory
- 선택된 profile path

그래서 측정 대상 Chrome은 `--remote-debugging-port`로 실행되어야 합니다.

## 결과 해석

- `Approx. impact`: baseline 대비 확장을 뺐을 때 줄어든 대략적인 private memory delta입니다.
- `Confidence: medium`: 다른 확장 target 변화가 관측되지 않았거나 오염이 적은 run입니다.
- `Confidence: low`: 다른 확장 target도 같이 변했거나 session-level delta만 강하게 반영된 run입니다.
- `Targets before->after`: DevTools에서 보인 extension target 개수 변화입니다.

## 한계

- Stable Chrome은 content script renderer memory를 확장별로 정확히 나누어 주지 않습니다.
- YouTube, 광고, 영상 상태, 캐시, 네트워크 상태에 따라 값이 흔들릴 수 있습니다.
- 확장이 많으면 확장 수만큼 clone Chrome을 순차 실행하므로 시간이 걸립니다.

## 개발자 검증 명령

```powershell
npm run desktop:list
npm run desktop:build
npm run test:e2e
```
