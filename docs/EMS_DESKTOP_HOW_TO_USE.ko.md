# EMS Desktop Companion 사용법

## 현재 상태

EMS Desktop은 복제된 프로브 프로필에서 A/B delta를 안전하게 측정해, 어떤 Chrome 확장 프로그램이 페이지 메모리 비용을 늘리는지 추정합니다. 실제 프로필을 수정하지 않으며 정확한 Chrome 메모리 소유량을 주장하지 않습니다.

Chrome extension은 검증된 artifact이자 선택적 helper 후보로 유지합니다. 메인 측정 UX는 데스크톱 앱입니다.

예: `AdBlock을 제거했을 때 이 페이지 세션 메모리가 약 40 MB 줄어듦`.

## 포터블 실행

배포 패키지를 받은 경우:

1. `EMS-Desktop-Portable` 폴더를 엽니다.
2. `EMS Desktop.exe`를 더블클릭합니다. `Start EMS Desktop.cmd`는 호환용 실행 파일입니다.
3. 우측 상단 safe-clone 배지 옆 언어 선택에서 `English` 또는 `Korean`을 선택합니다.
4. 앱에서 `프로브 Chrome 실행`을 누릅니다.
5. 열린 probe Chrome 프로필에 측정할 확장 프로그램을 설치하거나 켭니다.
6. probe Chrome에서 측정할 웹사이트를 엽니다.
7. EMS Desktop에서 `프로필 새로고침`을 누르고 해당 프로필을 선택합니다.

## 개발 환경에서 실행

repo 폴더에서:

```powershell
cd "C:\Users\lcmru\Desktop\EMS\ems-memory-probe"
npm run desktop:run
```

어느 위치에서든 실행:

```powershell
npm --prefix "C:\Users\lcmru\Desktop\EMS\ems-memory-probe" run desktop:run
```

또는 helper 스크립트:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\lcmru\Desktop\EMS\ems-memory-probe\tools\Start-EMSDesktop.ps1"
```

## 측정 흐름

1. 앱이 프로브 Chrome 프로필을 찾습니다. 고급 사용자가 직접 실행한 Chromium도 여기에 표시될 수 있습니다.
2. 선택한 프로필의 현재 활성 HTTP(S) 페이지가 측정 대상이 됩니다.
3. 최근 캐시 결과가 있으면 먼저 즉시 보여줍니다. `Median x3`를 켜면 확장 프로그램마다 A/B 샘플을 3회 실행해 median 값을 표시합니다.
4. 백그라운드 worker가 프로필을 clone하고 headless 측정을 실행합니다.
5. headless 캡처가 실패하면 off-screen headful worker로 재시도합니다.
6. 새 측정이 끝나면 결과 표가 갱신됩니다.

선택한 실제 probe 프로필은 수정하지 않습니다. 확장 비활성화는 clone 프로필 안에서만 수행됩니다. 따라서 현재 EMS Desktop은 선택한 브라우저에서 바로 `이 확장 비활성화`를 실행하는 live control을 제공하지 않습니다. 나중에 제어 기능을 추가한다면 명시적인 브라우저 전체 동작으로 만들거나 companion Chrome extension으로 구현해야 합니다.

## 고급: 명령줄로 probe Chrome 실행

```powershell
.\tools\Start-EMSDesktopProbeChrome.ps1 -Url "https://www.youtube.com/"
```

이 명령은 repo 내부 `.tmp\ems-desktop-probe-user-data`에 별도 Chrome 프로필을 만들고 EMS 측정에 필요한 DevTools endpoint를 켭니다. 대부분의 사용자는 앱의 `프로브 Chrome 실행` 버튼을 쓰는 편이 낫습니다.

## 결과 해석

- `예상 영향`: baseline clone 대비 해당 확장을 제거했을 때 줄어든 대략적인 private memory delta입니다.
- `신뢰도: 보통`: 관련 없는 확장 target 변화가 거의 없거나 관측되지 않은 run입니다.
- `신뢰도: 낮음`: 다른 확장 target도 변했거나 session-level delta 의존도가 큰 run입니다.
- `출처: 캐시됨`: 이전 측정값을 먼저 보여주는 상태입니다.
- `출처: 측정됨`: 백그라운드 측정이 완료된 새 결과입니다.
- `작업 방식: 백그라운드/오프스크린`: 측정에 사용된 clone Chrome 실행 방식입니다.

## 한계

- Stable Chrome은 content script renderer memory를 확장 프로그램별로 정확히 나눠주지 않습니다.
- 값은 페이지 상태, 광고, 영상 재생, 캐시, 네트워크 활동에 따라 달라질 수 있습니다.
- 확장이 많을수록 clone Chrome 실행 횟수가 늘어나므로 갱신 시간이 길어질 수 있습니다. `Median x3`는 샘플 수가 3배라 더 느립니다.

## 개발 검증 명령

```powershell
npm run desktop:list
npm run desktop:verify-safety
npm run desktop:build
npm run desktop:package
npm run test:e2e
```
