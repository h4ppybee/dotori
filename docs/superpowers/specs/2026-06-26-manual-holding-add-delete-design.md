# 수동 종목 추가/삭제 동선 개편 설계

날짜: 2026-06-26

## 배경 / 목적

현재 수동 종목 추가는 별도의 `보유` 탭(`app/holdings/page.tsx`)에서 이뤄진다.
사용자는 이 별도 탭을 없애고, 포트폴리오 메인의 `보유 종목` 카드에서 직접
추가할 수 있게 하길 원한다. 수동 추가 종목의 삭제는 종목 상세 화면에서 한다.

## 결정 사항

- 추가 폼은 **전용 라우트 페이지**(`/holdings/new`)로 띄운다. (모달 아님)
- 기존 `보유` 목록 페이지/라우트(`app/holdings/page.tsx`)는 **완전히 삭제**한다.
- 상세 화면 삭제 버튼은 **상세 정보 카드 하단의 텍스트 버튼**으로 둔다.
- 삭제 실행 전 **모달(Dialog)로 한 번 확인**한다.

## 변경 범위

### 1. `보유` 탭 제거
- `components/BottomTabBar.tsx`: `TABS`에서 `/holdings` 항목 제거 → `포트폴리오` / `설정` 2개 탭.
  미사용이 되는 `HoldingsIcon` 함수도 삭제.
- `app/holdings/page.tsx` 파일 삭제.
- `test/ui/HoldingsPage.test.tsx` 삭제.

### 2. 보유 종목 카드 + 버튼 → `/holdings/new`
- `components/portfolio/HoldingsTable.tsx`: 헤더(`보유 종목`)를 `flex justify-between`으로
  바꿔 우측에 `+` 아이콘 버튼(`Link href="/holdings/new"`) 추가. 상세 페이지 연필 버튼과
  동일한 원형 hover 스타일로 통일.
- 신규 `app/holdings/new/page.tsx`: 상세 페이지와 동일한 `‹ 뒤로` 헤더 + Card 안에
  `HoldingForm` 재사용. 저장 시 `queryClient.invalidateQueries({ queryKey: ["portfolio"] })`
  + `refresh.mutate()` 후 `router.push("/")`. 취소 시 `router.back()`.

### 3. 빈 상태 링크 수정
- `app/page.tsx`의 `EmptyState` "직접 추가하기" 버튼 링크를 `/holdings` → `/holdings/new`.

### 4. 상세 페이지 삭제 기능
- `app/holdings/[id]/page.tsx`: `holding.source === "MANUAL"`일 때만 상세 정보 카드 하단에
  `삭제하기` 텍스트 버튼(빨강 계열) 추가.
- 탭 시 기존 `Dialog`로 확인("이 종목을 삭제할까요? / 삭제하면 되돌릴 수 없어요.").
- 확정 시 `deleteHolding(id)` → portfolio 쿼리 무효화 → `router.push("/")`.

## 데이터 흐름 / 가드

- 추가·삭제 후 항상 portfolio 쿼리를 무효화해 메인 화면을 동기화한다.
- TOSS_API 종목은 수정/삭제 불가(기존 `isManual` 가드 유지).
- 빈 상태(보유 종목 0개)에서도 `/holdings/new`의 `HoldingForm`은 증권사 신규 추가 로직을
  포함하므로 정상 동작한다.

## 테스트 영향

- `HoldingsPage.test.tsx` 삭제.
- 필요 시 `test/ui/portfolio.test.tsx`에 + 버튼 링크 및 상세 삭제 흐름 검증 보강.
