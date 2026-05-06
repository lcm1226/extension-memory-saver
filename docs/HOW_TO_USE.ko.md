# EMS 사용법

이 문서는 현재 개발용 사용 흐름입니다. EMS 검증은 기본 개인 Chrome 프로필이 아니라 전용 테스트 프로필에서만 진행하세요.

## 빠른 흐름

1. 테스트 Chrome 프로필에서 `chrome://extensions`를 엽니다.
2. `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램 로드`를 누르고 이 repo의 `ems-extension` 폴더를 선택합니다.
4. 테스트할 사이트를 엽니다. 예: `https://www.youtube.com/watch?v=pa4Xo-LQe54`
5. EMS 팝업을 열고 확장 목록, 관련성 라벨, 메모리 추정값을 확인합니다.

## 프로필 인벤토리 가져오기

프로필 인벤토리는 안정 Chrome 런타임 API가 직접 주지 않는 manifest 신호를 보강합니다. 특히 `content_scripts.matches`, `optional_host_permissions` 확인에 씁니다.

PowerShell에서 repo 루트 기준으로 실행합니다.

```powershell
.\tools\Export-EMSProfileInventory.ps1 -ProfileDir "C:\Users\lcmru\AppData\Local\Google\Chrome\User Data\Profile 5"
```

기본 출력 파일은 다음입니다.

```text
test-results\profile-inventory.json
```

그 다음 EMS 팝업에서 `Import JSON`을 누르고 해당 JSON 파일을 선택합니다.

## 근실시간 메모리 추정값 가져오기

새로 설치한 확장에도 바로 MB 단위 추정값을 보고 싶다면 고급 프로브를 사용합니다. Chrome을 원격 디버깅 포트로 실행한 상태에서 다음 명령을 실행합니다.

```powershell
node .\tools\ems-measure.mjs live-estimates `
  --host 127.0.0.1 `
  --port 9222 `
  --profile-dir "<TEST_PROFILE_DIR>" `
  --target-url "https://www.youtube.com/watch?v=pa4Xo-LQe54" `
  --out .\test-results\live-memory-estimates.json
```

EMS 팝업에서 `Import JSON`을 누르고 `test-results\live-memory-estimates.json`을 선택하면 행별 `Advanced Memory Estimate`가 표시됩니다.

가능하면 EMS 팝업을 한 번 열어 service worker를 깨운 뒤 다음 옵션도 사용할 수 있습니다.

```powershell
node .\tools\ems-measure.mjs live-estimates --port 9222 --profile-dir "<TEST_PROFILE_DIR>" --apply-to-ems
```

이 옵션은 JSON 파일 생성과 함께 EMS local storage에 추정값을 직접 넣습니다. 팝업을 다시 열면 최신 값이 보입니다.

## 메모리 값을 읽는 법

EMS는 이제 두 종류의 값을 표시할 수 있습니다.

- `Advanced Memory Estimate`: 현재 Chrome 프로세스 snapshot에서 가져온 근실시간 추정값입니다.
- `Measured Memory Impact`: 같은 사이트 조건에서 확장을 제거한 A/B benchmark delta입니다.

신뢰도 해석은 다음과 같습니다.

- `high`: Chrome 프로세스 command line에서 확장 ID가 직접 관측되어 해당 프로세스 메모리를 합산한 값입니다.
- `low`: 공유 extension renderer 또는 manifest site match를 근거로 나눈 값입니다. 새 확장에 빠르게 값을 띄우기 위한 추정치입니다.

중요한 한계는 그대로입니다. 안정 Chrome은 content script가 일반 페이지 renderer 안에서 쓰는 메모리를 확장별로 정확히 분리해 주지 않습니다. 따라서 이 값은 실전 판단용 근사치이지, 완벽한 소유권 계측값은 아닙니다.

## 주요 버튼

- `Lighten This Site`: 현재 사이트와 관련 있어 보이는 확장을 브라우저 전체에서 비활성화합니다.
- `Restore Previous State`: 마지막 `Lighten This Site` 실행 직전 상태로 되돌립니다.
- `Save Current Setup`: 현재 사이트에서 켜진 확장 구성을 저장합니다.
- `Apply Saved Setup`: 저장된 구성을 현재 브라우저 확장 상태에 적용합니다.
- `Clear Saved Setup`: 현재 사이트의 저장 구성을 삭제합니다.
- `Import JSON`: benchmark label, live memory estimate, profile-inventory JSON을 가져옵니다.
- `Reset Defaults`: 기본 benchmark label로 되돌리고 가져온 manifest signal 및 live memory estimate를 지웁니다.

## 주의

Enable, Disable, Lighten, Restore, Apply는 탭 하나만 바꾸는 기능이 아닙니다. Chrome 확장 상태는 브라우저 전체에 적용됩니다.