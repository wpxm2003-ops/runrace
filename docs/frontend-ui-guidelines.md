# 프론트엔드 UI 가이드

## 네이티브 select 금지 규칙

앱 화면에서는 네이티브 HTML `<select>`를 사용하지 않습니다.

이유:
- 앱이 사용하는 Android WebView에서는 네이티브 `<select>`가 깨진 시스템 UI나 렌더링 이상을 유발할 수 있습니다.
- 이 문제는 설치된 앱 안에서만 드러나는 경우가 많아서, 브라우저에서만 확인하면 놓치기 쉽습니다.

대신 아래 패턴을 사용합니다:
1. 현재 값을 보여주는 일반 `button`을 렌더링합니다.
2. 버튼을 누르면 커스텀 바텀시트 또는 모달 리스트를 엽니다.
3. 사용자는 그 리스트에서 항목을 선택합니다.
4. 선택이 끝나면 시트를 바로 닫습니다.

## 권장 패턴

기본 참고 구현 — 새 드롭다운은 아래 공용 컴포넌트에서 시작합니다:
- `frontend/src/app/_components/ui/BottomSheet.tsx` — 배경 오버레이, 배경 탭으로 닫기, `useNativeBack`, `role="dialog"`/`aria-modal`을 한 컴포넌트가 소유합니다.
- `frontend/src/app/_components/ui/SelectSheet.tsx` — 위를 감싼 단일 선택 목록. `role="listbox"`/`role="option"`/`aria-selected`와 "선택 즉시 닫기"까지 처리합니다.

사용 예시:
- `frontend/src/app/shoes/_components/ShoeFormSheet.tsx` — 트리거 버튼은 127-134행, `SelectSheet` 호출은 206-215행.

구현 메모:
- 트리거는 `<select>`가 아니라 `button`을 사용합니다. (직접 작성)
- 옵션 목록은 커스텀 시트/다이얼로그 안에서 렌더링하고, 필요에 따라 `role="dialog"` 또는 `role="listbox"`를 설정합니다. → `BottomSheet`/`SelectSheet`를 쓰면 자동 충족됩니다.
- 시트가 열려 있을 때는 `useNativeBack(...)`를 연결해서 Android 뒤로가기가 먼저 시트를 닫도록 합니다. → `BottomSheet` 안에서 자동 충족됩니다. 오버레이를 직접 만들 때만 수동으로 연결합니다.
- 선택 해제가 필요하면 같은 목록 안에 "선택 안 함" 항목을 같이 둡니다. (직접 작성 — 옵션 배열에 넣어야 합니다)
- 시트가 닫힌 상태에서도 현재 선택값이 버튼에 보이도록 유지합니다. (직접 작성)

## 리뷰 체크리스트

드롭다운처럼 보이는 UI를 머지하기 전에 아래 항목을 모두 확인합니다:
- 앱 화면에서 네이티브 `<select>`를 사용하지 않았는가
- 브라우저 개발자도구만이 아니라 Android 앱 WebView에서도 실제 동작을 확인했는가
- 배경(backdrop)을 누르면 시트가 닫히는가
- Android 뒤로가기를 누르면 페이지 이탈보다 먼저 시트가 닫히는가
- 시트가 닫힌 뒤에도 현재 선택값을 읽을 수 있는가

## 적용 범위

이 규칙은 Capacitor Android 앱 안에서 동작하는 모든 화면에 적용합니다.
