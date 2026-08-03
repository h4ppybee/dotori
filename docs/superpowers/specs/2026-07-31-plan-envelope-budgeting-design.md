# 계획 탭 서브 네비 + 통장 쪼개기 설계

- 상태: 승인 대기(리뷰 루프 진행)
- 작성일: 2026-07-31
- 관련 문서: [architecture.md](../../architecture.md), [backup.md](../../backup.md), [DESIGN.md](../../../DESIGN.md)
- 출처: 사용자 가계부 시트 `뚜굥_가계부`의 `통장쪼개기` 탭(gid=1920130369)

## 배경 / 목적

계획 탭(`app/plan/page.tsx`)은 현재 플레이스홀더다. 이 탭을 **자산 탭처럼 하단 서브 네비(플로팅 pill)** 구조로 바꿔 여러 계획 기능을 담을 수 있게 하고, 첫 기능으로 **통장 쪼개기**를 넣는다. 부동산 조달계획은 후속(지금은 플레이스홀더 탭).

통장 쪼개기는 월 지출/저축을 **태그(고정지출·저축·투자·생활비·비상금 등)와 통장(은행)별로 분류·집계**하는 계획 도구다. 부부가 각자 수입에 따라 나누므로 **아내/남편 프로필**과 **통합 뷰**를 둔다.

## 범위

포함:

- 계획 탭 하단 서브 네비: 기존 `AssetSubTabBar`를 범용 `NestedTabBar`로 일반화해 자산·계획이 공유.
- 통장 쪼개기: 프로필(통합/아내/남편), 라인 항목 CRUD, 통장별·태그별(+통합의 인물별) 롤업, 비율.
- 태그·은행 프리셋 + 사용자 추가.
- 신규 Dexie 테이블 `envelopeItems`·`envelopeConfig` + 백업 포함.
- 부동산 탭은 플레이스홀더(`DummyPage`) 라우트만.

제외(YAGNI):

- 목표 수입 기반 배분(남은/초과 계산). 배분은 **항목 합계 기준**(합계=100%).
- 프로필 이름 커스텀(아내/남편 고정).
- 부동산 조달계획 실제 기능.
- 항목 CSV/시트 동기화, 다중 플랜(월별 이력).

## 네비게이션 일반화

### 현황

`AppNav`가 경로로 `MainTabBar`(5탭)와 `AssetSubTabBar`(자산 pill)를 교대로 노출한다. 탭 정의는 `lib/nav/nav-config.tsx`, 활성 판정은 `lib/nav/active.ts`.

### 변경

- `components/nav/AssetSubTabBar.tsx` → **`components/nav/NestedTabBar.tsx`**로 일반화. props: `{ visible: boolean; tabs: TabDef[]; activeKey: string | null }`. 기존 자산 관련 import(assetSubTabs/resolveActiveSub) 제거하고 props로 받는다. 단 **낙관적 pendingKey 초기화용 `usePathname()`은 컴포넌트 내부에 유지**한다(경로가 바뀌면 pendingKey를 폐기하는 렌더 중 보정 로직). `activeKey`는 prop이지만 `activeKey = pendingKey ?? props.activeKey`로 합성. ←복귀(lastMainTabPath)·애니메이션 로직도 그대로 유지(범용).
- `lib/nav/nav-config.tsx`: `planSubTabs: TabDef[]` 추가.
  - `{ key: "envelope", href: "/plan", label: "통장 쪼개기", icon: EnvelopeIcon }`
  - `{ key: "realty", href: "/plan/realty", label: "부동산", icon: RealtyIcon }` (플레이스홀더)
  - 아이콘은 기존 stroke 아이콘 규칙(DESIGN)대로 신규 2종 추가.
- `lib/nav/active.ts`:
  - `isPlanRoute(pathname)` = `pathname === "/plan" || startsWith("/plan/")`.
  - `isNestedRoute(pathname)` = `isAssetsRoute || isPlanRoute`.
  - `resolveActivePlanSub(pathname)`: `/plan/realty*` → `"realty"`, 그 외 plan 경로 → `"envelope"`(catch-all fallback). 자산은 fallback key가 별도 `"overview"`지만 계획은 `"envelope"`가 곧 기본 탭이라 fallback과 동일 — **의도된 차이**(active.ts에 주석 명시).
- `components/nav/AppNav.tsx`: `isDetailRoute`는 그대로 children-only. `nested = isNestedRoute(pathname)`로 패딩 결정(자산과 동일 값 재사용 — plan pill 높이도 56+24로 동일). 경로에 따라 탭셋/활성키를 **명시적으로 선택**해 전달:
  ```ts
  const plan = isPlanRoute(pathname);
  const tabs = plan ? planSubTabs : assetSubTabs;
  const activeKey = plan ? resolveActivePlanSub(pathname) : resolveActiveSub(pathname);
  // <NestedTabBar visible={nested} tabs={tabs} activeKey={activeKey} />
  ```
  `MainTabBar visible={!nested}`.
- `components/nav/MainTabBar.tsx`: 직전 메인 탭 저장 조건을 **진입 대상 nest별로** 판정한다. `!isNestedRoute`로 뭉뚱그리면 `/assets/*`에서 계획 탭을 누를 때 `!isNestedRoute`가 false라 저장되지 않아 계획 pill의 ← 복귀가 깨진다. 대상 nest에 이미 있을 때만 건너뛴다:
  ```ts
  const enteringAssets = tab.key === "assets" && !isAssetsRoute(pathname);
  const enteringPlan = tab.key === "plan" && !isPlanRoute(pathname);
  if (enteringAssets || enteringPlan) {
    setLastMainTab(pathname);
  }
  ```
- `/plan`이 통장쪼개기 화면 자체(자산의 `/assets` 개요와 동일 원리) → 리다이렉트 불필요. `app/plan/realty/page.tsx`는 `DummyPage`.

## 데이터 모델 (Dexie v9)

```ts
// lib/types.ts
export type EnvelopeProfile = "wife" | "husband";

export interface EnvelopeItem {
  id: string;               // uuid
  profile: EnvelopeProfile; // 아내/남편
  tag: string;              // 태그(프리셋 or 커스텀)
  account: string;          // 은행/통장(프리셋 or 커스텀)
  name: string;             // 항목명
  amountKrw: number;        // 금액(원, ≥ 0)
  note?: string;            // 비고
  sortOrder: number;        // 프로필 내 정렬
  createdAt: number;        // epoch ms
}

export interface EnvelopeConfig {  // 단일 행: 사용자 추가분
  id: "envelope";
  customTags: string[];
  customAccounts: string[];
}
```

```ts
// lib/db/schema.ts — v8 뒤에 추가
// v9: 통장 쪼개기 테이블 추가 (docs/superpowers/specs/2026-07-31-plan-envelope-budgeting-design.md)
this.version(9).stores({
  envelopeItems: "id, profile, sortOrder",
  envelopeConfig: "id",
});
```

필드 선언: `envelopeItems!: Table<EnvelopeItem, string>;`, `envelopeConfig!: Table<EnvelopeConfig, string>;`.

### 프리셋 상수 (`lib/envelope/presets.ts`)

```ts
export const TAG_PRESETS = ["고정지출", "저축", "투자", "생활비", "비상금"] as const;
export const ACCOUNT_PRESETS = ["신한", "토스", "케이뱅크", "하나당근", "국민", "신용카드(현대)", "신용카드(삼성)"] as const;
```

사용 가능한 태그/은행 = 프리셋 ∪ `EnvelopeConfig`의 커스텀(중복 제거, 프리셋 우선 순서).

### CRUD (`lib/db/local-store.ts`)

- `listEnvelopeItems()`, `getEnvelopeItem(id)`, `upsertEnvelopeItem(...)`(savings의 `upsert` + `nextSortOrder` 패턴 차용, sortOrder는 프로필별 최대+1), `deleteEnvelopeItem(id)`.
- `bulkUpdateEnvelope(rows)`: 일괄 편집 모드 저장 전용 — 변경된 금액 일괄 upsert + 삭제 대상 일괄 delete를 단일 트랜잭션으로 처리.
- `getEnvelopeConfig()`(없으면 `{ id:"envelope", customTags:[], customAccounts:[] }` 기본), `putEnvelopeConfig(c)`. 태그/은행 추가 헬퍼(중복이면 무시).

## 순수 계산 `lib/envelope/envelope-service.ts`

DB·Date·비동기 없이 입력만으로.

```ts
export interface EnvelopeRollupEntry { key: string; amountKrw: number; ratioPct: number; }
export interface EnvelopeItemRow { item: EnvelopeItem; ratioPct: number; }

export interface EnvelopeView {
  scope: "combined" | EnvelopeProfile;
  totalKrw: number;
  rows: EnvelopeItemRow[];              // 개별 프로필 뷰: sortOrder 순. combined: 전체 항목(아내→남편 순), 비율은 combined 총액 기준
  byTag: EnvelopeRollupEntry[];         // 태그별 합·비율(금액 내림차순)
  byAccount: EnvelopeRollupEntry[];     // 통장별 합·비율
  byProfile: EnvelopeRollupEntry[];     // combined에서만 채움(아내/남편 합), 그 외 빈 배열
}

export function buildEnvelopeView(input: {
  items: EnvelopeItem[];
  scope: "combined" | EnvelopeProfile;
}): EnvelopeView;
```

규칙:

- 대상 항목: `scope==="combined"`면 전체, 아니면 `item.profile===scope`.
- `totalKrw` = 대상 항목 `amountKrw` 합.
- `ratioPct` = `total>0 ? amount/total*100 : 0`.
- `byTag`/`byAccount`: 대상 항목을 키로 그룹핑해 합·비율, **금액 내림차순** 정렬. 동점이면 **키 문자열 오름차순**을 2차 기준으로(결정적 정렬 → 테스트·도넛 순서 안정). 0원 항목만 있는 그룹도 실재 항목이므로 **표시**한다(금액 0·비율 0). 항목이 하나도 없는 그룹만 제외.
- `byProfile`: combined일 때만 `wife`/`husband` 합(없는 프로필은 0으로 표기하지 않고 항목 있을 때만). 개별 뷰에선 빈 배열.
- `rows`: 개별 프로필 뷰에서는 `sortOrder` 순으로 채움. combined에서는 **전체 항목을 아내→남편 순으로 채움**(비율은 combined 총액 기준).
- 빈 목록: total 0, 모든 배열 빈 배열, ratio 0.

## UI

### 통장쪼개기 화면 `app/plan/page.tsx` (`"use client"`)

- 레이아웃: 자산 탭과 동일 컨테이너(`max-w-[480px]` + nested 패딩은 AppNav가 처리).
- 상단 **프로필 세그먼트**(`ProfileSegment`): `통합 | 아내 | 남편`. 기본 `통합`. 로컬 상태(URL 아님) — v1은 세션 상태로 충분.
- 잠금 시 자산 훅처럼 쿼리 비활성.
- **아내/남편 뷰**:
  - 총액 카드(`formatKrw(totalKrw)`, 중립 `text-ink`).
  - 롤업: `RollupCard` 통장별 / 태그별(항목·금액·비율) — **항목 목록 및 "+ 항목 추가" 버튼 위에** 배치.
  - 라인 항목 리스트: 각 행 `EnvelopeItemRow`(항목명 + 태그 칩 + 통장 + 금액 + 비율%). 탭 → 수정 Dialog.
  - "+ 항목 추가" 버튼 → 추가 Dialog.
  - 도넛 차트 없음(통합 뷰로 이동됨).
- **통합 뷰**: 합산 총액 + 태그별 `DonutChart`(중앙 총액, 태그색 매핑) + `RollupCard` 통장별·인물별. 아래에 아내/남편 섹션별로 전체 항목 리스트(인물별 소계 표시). 추가 버튼 없음(항목 추가는 프로필 뷰에서).
- **일괄 편집 모드(모든 뷰 공통)**: 상단 우측 "편집" 버튼 진입 → 각 행에 금액 인라인 입력(`bg-surface-soft`, 우측 정렬, `tabular-nums`) + X 삭제 버튼 표시. "저장하기" 확정 시 `bulkUpdateEnvelope`로 변경분 일괄 반영. 저축 탭 `SavingsManageList` 편집 모드와 동일 UX 패턴. AUTO 행은 편집 잠금(연동 출처 배지 규칙과 동일).
- 금액은 손익이 아니므로 **중립 `text-ink`**(증시 up/down 색 금지, DESIGN 규칙).

### 항목 Dialog `components/envelope/EnvelopeItemDialog.tsx`

- `Dialog` 기반. props: `{ open, profile, initial?, onClose, onSubmit, onDelete?, submitting? }`.
- 필드: 항목명(`TextInput`), 금액(`TextInput` numeric, 원), 태그(칩 선택 + "직접 추가"), 통장(칩 선택 + "직접 추가"), 비고(선택).
- 태그/은행 칩: 프리셋 ∪ 커스텀에서 선택. "직접 추가" 입력 시 `EnvelopeConfig`에 append 후 선택. **주의**: 커스텀 추가는 열려 있는 Dialog의 `key`를 바꾸지 않아야 한다(config 변경으로 Dialog가 리마운트되면 작성 중이던 폼 상태가 날아간다). Dialog의 remount key는 열림 전환·편집 대상 항목에만 의존하고, 사용 가능한 태그/은행 목록은 실시간 prop으로 흘려보낸다.
- 유효성: 항목명 비어있지 않음 & 금액 ≥ 0(0 허용, 시트에 0원 항목 존재) & 태그·통장 선택됨.
- 폼 초기화는 GoalForm과 동일한 **key 재마운트 계약**(effect 내 setState 금지 lint 규칙) — 부모가 열 때 바뀌는 key 부여.

### 컴포넌트 `components/envelope/`

- `ProfileSegment.tsx` — 세그먼트 컨트롤(통합/아내/남편). 신규(재사용 프리미티브 없음). DESIGN 토큰.
- `EnvelopeItemRow.tsx` — 리스트 행.
- `EnvelopeItemDialog.tsx` — 추가/수정/삭제.
- `RollupCard.tsx` — `{ title; entries: EnvelopeRollupEntry[]; colorFor?(key) }` 범용 롤업(통장/태그/인물 공용).
- 태그 색: `lib/envelope/tag-color.ts` — 프리셋 태그 고정색(DonutChart 팔레트 매핑), 커스텀은 팔레트 순환.

### 쿼리 훅 `lib/query/use-envelope.ts`

- `useEnvelopeItems()`(잠금 시 비활성), `useEnvelopeConfig()`, `useEnvelopeMutations()`(항목 upsert/delete + `bulkUpdate`(일괄 편집 저장) + 태그/은행 추가, 성공 시 무효화).

## 백업

`lib/backup/backup.ts`: `envelopeItems`·`envelopeConfig`를 수동 데이터로 포함.

- `BackupData`에 `envelopeItems: unknown[]; envelopeConfig: unknown[];` 추가.
- `exportAll`: 두 테이블 `toArray()` 추가.
- `importAll`: `?? []` 하위호환, overwrite 시 `clear()`, `bulkPut`.
- `SCHEMA_VERSION` 7, `SUPPORTED_VERSIONS`에 7 추가.
- `docs/backup.md` 표·버전 이력 갱신.

## 문서 동기화

- `AGENTS.md`: 계획 탭 기능화(더 이상 플레이스홀더 아님, 부동산은 플레이스홀더), nav 일반화(`NestedTabBar`), `lib/envelope`, `components/envelope`, `use-envelope`, `envelopeItems`·`envelopeConfig` 테이블(백업 포함).
- `docs/architecture.md`: 계획 탭·nav 구조·envelope 데이터 흐름·테이블.
- `docs/backup.md`: envelope 테이블 백업 포함(payload v7).
- `DESIGN.md`: `ProfileSegment` 규격, 태그 색 매핑 규칙 추가.

## 테스트

- `test/envelope/envelope-service.test.ts`: 비율·태그/통장 롤업·내림차순 정렬·통합 합산(아내+남편)·인물별 롤업·빈 목록·total 0 시 ratio 0.
- `test/backup/backup.test.ts`: envelopeItems·envelopeConfig 라운드트립.
- `test/nav/active.test.ts`(있으면 확장): `isPlanRoute`·`resolveActivePlanSub`·`isNestedRoute`.

## 오픈 이슈 / 트레이드오프

- `AssetSubTabBar` → `NestedTabBar` 일반화 시 import 경로 변경 파급(AppNav만 사용). 자산 동작 회귀 없어야 함 — nav active 테스트로 방어.
- 프로필 상태는 URL이 아닌 컴포넌트 로컬 상태(v1). 새로고침 시 통합으로 초기화 — 허용.
- 통합 뷰는 **항목 리스트 표시 및 일괄 편집 가능**. 단, 항목 추가("+항목 추가" 버튼)는 프로필 뷰(아내/남편)에서만 — 새 항목의 `profile` 귀속을 명확히 하기 위함. 명시적 결정.

