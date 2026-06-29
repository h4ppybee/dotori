# 저축/현금성 페이지 설계

작성일: 2026-06-29
상태: 승인 대기 (사용자 리뷰 전)

## 목적

dotori 자산 탭의 **저축/현금성** 화면을 구현한다. 현재 `/assets/savings`는 더미 페이지다.
주식 페이지와 유사한 구성(요약 히어로 + 도넛)을 가지되, 저축은 **금액 수정이 잦으므로**
한 화면에서 금액을 일괄 인라인 수정하기 좋은 관리 UI를 제공한다. 예적금·파킹·채권에는
이율·만기·월 불입액 같은 상세 컬럼을 노출한다.

토스인베스트 자산 관리 화면의 3단계 흐름(개요 → 관리 리스트 → 편집)을 참고한다.

## 확정된 결정 (브레인스토밍)

- **데이터 출처/저장**: 완전 수동·로컬. 토스 연동 없음. 보유종목처럼 평문 저장(민감정보 암호화 대상 아님).
- **카테고리**: 고정 4종 — 예적금 / 입출금 / 채권 / 기타.
- **편집 범위**: 금액 중심 일괄 인라인 수정 + 항목 추가/삭제. 이율·만기·은행 등 상세는 단건 항목을 탭해 편집.
- **화면 구조**: 개요 페이지 + 별도 관리 페이지 분리(목업 3단계 흐름).
- **요약 지표**: 총액 + 카테고리 비율 강조(손익 개념 없음).
- **상세 컬럼 노출**: 카테고리별 선택 노출(해당 없는 필드는 입력칸 자체를 숨김).
- **외화(달러)**: **모든 카테고리**에서 통화 선택(KRW/USD)을 지원하고 기본값은 KRW. USD 항목은 자기 통화로 금액을 보관하고, 합계·도넛·요약은 저장된 USDKRW 환율로 원화 환산한다. (카테고리별 허용 제한은 두지 않는다 — 단순화.)
- **도넛**: 공용 `DonutChart` 프리미티브로 추출해 `SectorDonut`/`SavingsDonut`이 공유. 다른 탭에서도 재사용 예정.

## 데이터 모델

스키마 v3로 `savings` 테이블을 추가한다(`lib/db/schema.ts`).

```ts
// lib/types.ts
export type SavingsCategory = "DEPOSIT" | "CHECKING" | "BOND" | "ETC";
// 예적금 / 입출금(파킹) / 채권 / 기타

export interface SavingsAccount {
  id: string;
  category: SavingsCategory;
  name: string;            // 내용(계좌명) — 예: "뚜니 청년도약"
  bank?: string;           // 은행 — 예: "우리"
  amount: number;          // 총 금액 (currency 기준 통화)
  currency?: Currency;     // 통화. undefined === "KRW" (기본). 모든 카테고리에서 KRW/USD 선택 가능
  interestRate?: number;   // 이율 (%) — DEPOSIT/CHECKING/BOND
  maturityDate?: string;   // 만기 "YYYY-MM-DD" — DEPOSIT/BOND
  monthlyDeposit?: number; // 월 불입액 (KRW) — DEPOSIT
  note?: string;           // 비고
  sortOrder: number;       // 카테고리 내 표시 순서
  updatedAt: number;
}
```

`Currency`는 기존 `lib/types.ts`의 `"KRW" | "USD"`를 재사용한다. `currency`가
`undefined`면 KRW로 간주한다(기본값·마이그레이션 안전). 통화는 모든 카테고리에서 KRW/USD 중
자유롭게 선택할 수 있다(카테고리별 허용 제한 없음).

Dexie 스키마:

```ts
// version(3)
savings: "id, category, sortOrder",
```

### 카테고리별 노출 필드

| 카테고리 | 이율 | 만기 | 월 불입액 | 통화 선택 |
|---|---|---|---|---|
| 예적금(DEPOSIT) | O | O | O | O (KRW/USD) |
| 입출금(CHECKING) | O | - | - | O (KRW/USD) |
| 채권(BOND) | O | O | - | O (KRW/USD) |
| 기타(ETC) | - | - | - | O (KRW/USD) |

해당 없는 필드는 편집 다이얼로그에서 입력칸 자체를 렌더링하지 않는다.

통화는 모든 카테고리에서 KRW/USD 중 선택할 수 있고 기본값은 KRW. USD 금액은 자기 통화로
저장하고 합계/도넛에서 USDKRW 환율로 원화 환산한다(아래 순수 계산).

## 순수 계산 (`lib/savings/savings-service.ts`)

DB·비동기·`Date` 없이 입력만으로 `SavingsVM`을 산출한다(`lib/portfolio/portfolio-service` 패턴 동일, 테스트 대상).

```ts
export const SAVINGS_CATEGORIES: { key: SavingsCategory; label: string }[] = [
  { key: "DEPOSIT", label: "예적금" },
  { key: "CHECKING", label: "입출금" },
  { key: "BOND", label: "채권" },
  { key: "ETC", label: "기타" },
];

export interface SavingsCategorySummary {
  category: SavingsCategory;
  label: string;
  amountKrw: number;
  pct: number;        // 0~100, 전체 대비 비율
  count: number;
}

export interface SavingsAccountView extends SavingsAccount {
  amountKrw: number;   // currency==="USD"면 amount * usdKrwRate, 아니면 amount
}

export interface SavingsGroup {
  category: SavingsCategory;
  label: string;
  amountKrw: number;
  accounts: SavingsAccountView[]; // sortOrder 정렬, 원화 환산값 포함
}

export interface SavingsVM {
  totalKrw: number;
  monthlyDepositTotal: number;
  byCategory: SavingsCategorySummary[]; // 금액 0 카테고리 제외(도넛/요약), 정렬은 SAVINGS_CATEGORIES 순
  groups: SavingsGroup[];               // 관리 화면용, 빈 카테고리 제외
  count: number;
  usdKrwRate?: number;                  // 환산에 쓴 환율(표시·디버그용). 없으면 USD 환산 불가 상태
}

export function buildSavingsVM(accounts: SavingsAccount[], usdKrwRate?: number): SavingsVM;
```

- **원화 환산**: `currency === "USD"`인 항목의 `amountKrw = amount * usdKrwRate`. KRW 항목은 `amount` 그대로.
- **환율 부재 처리**: `usdKrwRate`가 없을 때 USD 항목의 `amountKrw`는 0으로 집계하되, 원본 `amount`(달러)는 행에 그대로 표시한다. 페이지는 환율 미보유 시 안내 문구를 노출할 수 있다("환율을 불러오면 원화 합계에 반영돼요"). KRW만 있는 경우엔 영향 없음.
- 비율은 `totalKrw === 0`일 때 0으로 처리(0 나눗셈 방지).
- 정렬: 카테고리는 `SAVINGS_CATEGORIES` 고정 순서, 카테고리 내부는 `sortOrder` 오름차순.

## DB CRUD (`lib/db/local-store.ts`)

```ts
export const listSavings = () => db.savings.toArray();
export async function upsertSavings(s: Partial<SavingsAccount> & { id?: string }): Promise<SavingsAccount>;
export const deleteSavings = (id: string) => db.savings.delete(id);
export async function bulkUpdateSavings(rows: SavingsAccount[]): Promise<void>; // 편집 모드 일괄 저장(bulkPut)
```

새 계좌의 `sortOrder`는 해당 카테고리 최대값 + 1.

## 쿼리 (`lib/query/use-savings.ts`)

`@tanstack/react-query` 사용(포트폴리오 패턴과 일치).

- `useSavings()` — queryKey `["savings"]`. 내부에서 `listSavings()`와 `getFx()`를 함께 읽어
  `buildSavingsVM(accounts, fx?.rate)`를 반환한다(USD 환산용 환율 주입).
- mutation 헬퍼는 호출부에서 `queryClient.invalidateQueries({ queryKey: ["savings"] })`로 갱신.

## 컴포넌트

### 공용 추출: `components/ui/DonutChart.tsx`

`SectorDonut`의 SVG 기하/팔레트 로직을 표현형 프리미티브로 분리한다.

```ts
interface DonutSegment { label: string; value: number; pct: number; }
interface DonutChartProps {
  segments: DonutSegment[];
  centerLabel?: string;   // 예: "총평가금" / "총 자산 비중"
  centerValue?: string;   // 포맷된 금액 문자열
  size?: number;          // 기본 160
  ariaLabel: string;
  renderLegendValue?: (seg, color) => ReactNode; // 범례 우측(금액/비율) 커스터마이즈
}
```

- 팔레트·track·세그먼트 갭·MIN_ARC 상수는 DESIGN.md `donut-chart` 토큰을 그대로 사용.
- `SectorDonut`은 이 프리미티브를 쓰도록 리팩터(주식 페이지 시각·동작 무변경 — 기존 테스트로 회귀 확인).
- `SavingsDonut`은 `SavingsVM.byCategory`를 세그먼트로 매핑.

### `components/savings/SavingsSummaryHero.tsx`

요약 히어로 카드. "저축/현금성 자산" 라벨 + 총액(`number-hero`) + "총 N개 계좌" 보조.
손익 없음 → up/down 색 미사용, 금액은 `text-ink`. `PrivacyAmount`로 총액 마스킹.

### `components/savings/SavingsDonut.tsx`

`DonutChart` 래퍼. 카테고리 비중 도넛 + 범례(비율 + 금액). 가운데 총액.
빈 상태(총액 0)에서는 렌더하지 않음.

### `components/savings/SavingsCategoryCards.tsx`

카테고리 요약 카드 4개(아이콘 + 이름 + 합계). 탭하면 관리 화면을 해당 카테고리 필터로 연다
(`/assets/savings/manage?cat=DEPOSIT`). 금액 0 카테고리도 표시하되 회색 처리.

### `components/savings/SavingsAccountDialog.tsx`

단건 추가/편집 다이얼로그(`components/ui/Dialog` 사용). 필드: 카테고리(칩 선택) · 이름 · 은행 ·
금액 · 통화(KRW/USD 칩, 기본 KRW) · (카테고리별) 이율 · 만기 · 월 불입액 · 비고.
좌측 버튼은 "닫기"(DESIGN.md 규칙), 우측 "저장하기". 삭제는 편집 다이얼로그 하단의 텍스트
버튼 또는 편집 모드 X로 처리.

- 통화 칩은 모든 카테고리에서 노출(기본 KRW).
- 금액 입력 라벨·기호는 선택 통화에 맞춰 `₩`/`$`로 전환. USD 선택 시 보조 텍스트로 원화 환산값(`≈ ₩…`)을 환율 기준으로 미리보기(환율 없으면 생략).

### `components/savings/SavingsManageList.tsx`

관리 화면 본문. 카테고리 필터 칩(전체/예적금/입출금/채권/기타) + 카테고리별 접이식 섹션
(소계 표시) + 계좌 행.

- **보기 모드**: 행 = `이름 / 은행 · 연 X% · 만기 / 금액 >`. USD 항목은 금액을 `$X,XXX.XX`로,
  바로 아래 보조에 원화 환산 `≈ ₩…`(환율 있을 때)을 표시. 행 탭 → `SavingsAccountDialog`(편집).
- **편집 모드**: 각 행의 금액이 인라인 입력으로 전환 + 우측 X(삭제). USD 항목의 입력 기호는 `$`,
  통화 자체 변경은 단건 다이얼로그에서 처리(인라인은 금액만). 섹션 하단 "+ 항목 추가"
  → 새 항목은 `SavingsAccountDialog`로 추가(카테고리 프리셋). 헤더는 취소/저장으로 전환,
  저장 시 변경분 `bulkUpdateSavings`로 일괄 반영. 취소 시 폐기.

만기 표시는 텍스트만(D-day 리마인더는 범위 외, 후속).

## 라우트

- `app/assets/savings/page.tsx` — 개요(더미 대체). 빈 상태: "아직 저축 계좌가 없어요. 직접 추가해 보세요." + "추가하기" CTA.
  데이터 있으면 Hero + SavingsDonut + SavingsCategoryCards + 하단 CTA(+ 추가 / 관리).
- `app/assets/savings/manage/page.tsx` — 관리. 헤더(총액 + 계좌 수 + 편집 토글) + SavingsManageList.
  카테고리 필터 초기값은 `?cat=` 쿼리에서 읽음(`useSearchParams`).

모두 `"use client"`. IndexedDB는 SSR 접근 금지.

## 디자인 토큰 (DESIGN.md 준수)

- 색·타이포·간격·radius·shadow는 DESIGN.md 토큰만 사용. 임의 값 신설 금지.
- 도넛 팔레트 = `donut-chart.palette`.
- 금액은 `number-hero`/`number-lg`/`number-md` + tabular-nums. 손익색(up/down) 미사용.
- 통화 포맷은 `lib/format`의 `formatKrw`/`formatUsd` 재사용(신규 포매터 금지). USD 원화 환산 표기는 `≈ ₩…`.
- 버튼 primary(갈색)/secondary(brown-surface), 입력은 `text-input`, 칩은 `chip`/`chip-selected`.
- UX 라이팅: 해요체·능동·긍정. 다이얼로그 좌측 버튼 "닫기". 빈 상태/저장 카피 토스 톤.
- `PrivacyAmount`로 총액·카테고리·행 금액 마스킹(설정 금액 숨기기 연동).

## 테스트

- `test/savings/savings-service.test.ts` — `buildSavingsVM`: 합계, 카테고리 비율(0 나눗셈 포함),
  월 불입액 합계, 정렬, 빈 입력, 빈 카테고리 제외, **USD 원화 환산(환율 있음/없음 케이스)**.
- `test/savings/savings-store.test.ts`(또는 통합) — `fake-indexeddb`로 CRUD + 편집 일괄 저장 1 케이스.
- `DonutChart` 추출 후 기존 `SectorDonut` 관련 테스트 회귀 통과.

## 범위 밖 (YAGNI)

- 토스 API 연동. (USD 입력은 지원하되 환율은 기존 저장된 USDKRW만 사용 — 저축 전용 환율 갱신은 하지 않음.)
- 만기 D-day 알림/리마인더.
- 저축 일별 스냅샷/추이(손익 없음).
- 계좌번호 표시(모델엔 두지 않음 — 필요 시 후속).

## 구현 순서/참고 (스펙 리뷰 반영)

- `DonutChart` 추출을 **첫 작업**으로 두고, 저축 컴포넌트 착수 전에 기존 `SectorDonut` 테스트를 회귀 게이트로 통과시킨다(두 도넛이 이 프리미티브에 의존).
- 카드 외곽(헤딩 "섹터 비중" / "총 자산 비중")은 `DonutChart` 밖, 각 소비자(`SectorDonut`/`SavingsDonut`)에 둔다. `DonutChart`는 도넛+범례+가운데 텍스트만 담당(`centerLabel`/`centerValue` props).
- 저축 금액 포맷은 새 포매터를 만들지 말고 기존 `lib/format`의 `formatKrw` 등을 재사용한다.

## 영향 파일 요약

신규: `lib/savings/savings-service.ts`, `lib/query/use-savings.ts`,
`components/ui/DonutChart.tsx`, `components/savings/*`(Hero/Donut/CategoryCards/Dialog/ManageList),
`app/assets/savings/manage/page.tsx`, `test/savings/*`.

수정: `lib/types.ts`, `lib/db/schema.ts`(v3), `lib/db/local-store.ts`,
`components/portfolio/SectorDonut.tsx`(DonutChart 사용), `app/assets/savings/page.tsx`,
필요 시 `DESIGN.md`(DonutChart 프리미티브 규격 추가).
