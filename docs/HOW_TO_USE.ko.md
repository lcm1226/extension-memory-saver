# EMS 사용법

이 문서는 현재 개발용 사용 흐름입니다. 검증은 기본 개인 Chrome 프로필이 아니라 전용 테스트 프로필에서만 진행하세요.

## 빠른 흐름

1. Chrome 테스트 프로필에서 `chrome://extensions`를 엽니다.
2. `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 누르고 이 repo의 `ems-extension` 폴더를 선택합니다.
4. 테스트할 사이트를 엽니다. 예: `https://www.youtube.com/watch?v=pa4Xo-LQe54`
5. EMS 팝업을 열고 확장 목록, 관련성 표시, `Measured Memory Impact` 값을 확인합니다.

## 프로필 인벤토리 가져오기

프로필 인벤토리는 Chrome 런타임 API가 직접 주지 않는 `content_scripts.matches`, `optional_host_permissions` 같은 manifest 신호를 읽어 site relevance를 보강합니다.

PowerShell에서 repo 루트 기준으로 실행합니다.

```powershell
.\tools\Export-EMSProfileInventory.ps1 -ProfileDir "C:\Users\lcmru\AppData\Local\Google\Chrome\User Data\Profile 5"
```

기본 출력 파일은 다음 경로입니다.

```text
test-results\profile-inventory.json
```

그 다음 EMS 팝업에서 `Import JSON`을 누르고 위 JSON을 선택합니다.

## 메모리 값 읽는 법

`Measured Memory Impact`는 실시간 점유 메모리의 완전한 소유권 값이 아닙니다. EMS probe가 같은 사이트/조건에서 확장을 제거한 전후를 비교한 A/B 시나리오 델타입니다.

현재 가장 실용적인 해석은 다음과 같습니다.

- `Measured Memory Impact`: 해당 확장을 제거했을 때 줄어든 것으로 관측된 메모리 추정치
- `renderer / total`: 렌더러 private memory 감소와 전체 Chrome private memory 감소
- `impact: low / medium / high`: 측정 델타를 기준으로 한 위험도 라벨

즉 “라이브 메모리 소유권”은 아니지만, 사용자가 끄면 실제로 줄어들 가능성이 높은 비용을 보여주는 값입니다.

## 주요 버튼

- `Lighten This Site`: 현재 사이트와 관련 있어 보이는 확장을 브라우저 전체에서 비활성화합니다.
- `Restore Previous State`: 직전 `Lighten This Site` 실행 전 상태로 되돌립니다.
- `Save Current Setup`: 현재 사이트에서 켜진 확장 구성을 저장합니다.
- `Apply Saved Setup`: 저장된 구성을 현재 브라우저 확장 상태에 적용합니다.
- `Clear Saved Setup`: 현재 사이트 저장 구성을 삭제합니다.
- `Import JSON`: benchmark label 또는 profile-inventory JSON을 가져옵니다.
- `Reset Defaults`: 기본 benchmark label로 되돌리고 가져온 manifest signal을 지웁니다.

## 주의

Enable, Disable, Lighten, Restore, Apply는 탭 하나만 바꾸는 기능이 아닙니다. Chrome 확장 상태는 브라우저 전체에 적용됩니다.
