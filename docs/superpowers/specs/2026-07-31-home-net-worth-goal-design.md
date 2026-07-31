# 홈 순자산 표시 + 목표 자산 설계

- 상태: 승인 대기(리뷰 루프 진행)
- 작성일: 2026-07-31
- 관련 문서: [architecture.md](../../architecture.md), [backup.md](../../backup.md), [DESIGN.md](../../../DESIGN.md)

## 배경 / 목적

홈 탭(`app/page.tsx`)은 현재 플레이스홀더(`DummyPage`)다. 사용자가 홈에서:

1. **순자산 금액**을 바로 본다.
2. **목표 자산 금액 + 목표 날짜**를 설정한다.
3. 설정하면 **매월 모아야 하는 금액**과 **목표까지 남은 총금액**을 보고, **진행률 링**으로 시각화된 진척을 본다.

목표가 추적하는 기준 금액은 **순자산**(자산합 − 부채)이다. 홈에 표기하는 값과 동일해 직관적이다.

## 범위

포함:

- 홈 페이지를 실제 기능 화면으로 전환(순자산 히어로 + 목표 섹션).
- 목표 저장용 신규 Dexie 테이블 `goal`(단일 행) + 백업 포함.
- 목표 진척 순수 계산 모듈 + 진행률 링 컴포넌트.

제외(YAGNI):

- 다중 목표/목표 이력.
- 목표 달성 알림/푸시.
- 스냅샷 이력을 겹쳐 그리는 추이 그래프(진행률 링/바만).
- 목표 종류 선택(순자산 고정).

## 데이터 모델

### 신규 테이블 `goal` (Dexie schema v8)

```ts
// lib/types.ts
export interface Goal {
  id: "goal";                 // 단일 행(고정 키)
  targetNetWorthKrw: number;  // 목표 순자산(원, > 0)
  targetDate: string;         // "YYYY-MM-DD" 목표 날짜
  createdAt: number;          // epoch ms
}
```

```ts
// lib/db/schema.ts — 기존 v7 뒤에 추가
// v8: 순자산 목표 테이블 추가
this.version(8).stores({
  goal: "id",
});
```

`goal!: Table<Goal, string>;` 필드 선언 추가.

**왜 `settings`가 아니라 신규 테이블인가:** `settings`는 보안 앵커(`kdfSalt`/`verifier`)를 담고 있어 **백업에서 의도적으로 제외**된다(backup.md). 목표는 사용자가 직접 입력한 수동 데이터라 기기 이관 시 보존돼야 하므로, 백업 대상인 별도 테이블에 둔다.

### CRUD (`lib/db/local-store.ts`)

```ts
export const getGoal = () => db.goal.get("goal");
export const putGoal = (g: Goal) => db.goal.put(g);
export const deleteGoal = () => db.goal.delete("goal");
```

## 순수 계산 모듈 `lib/goal/goal-service.ts`

DB·비동기·`Date` 없이 입력만으로 결과를 낸다(프로젝트 순수 계산 규칙).

```ts
export type GoalStatus = "active" | "achieved" | "overdue";

export interface GoalProgress {
  targetKrw: number;
  currentKrw: number;
  remainingKrw: number;      // max(0, target - current) — 남은 총금액
  progressPct: number;       // current / target * 100 (음수·초과 그대로; 링은 표시 측에서 0~100 클램프)
  monthsRemaining: number;   // 오늘~목표날짜 남은 개월(올림, 최소 1). overdue면 0
  monthlyRequiredKrw: number;// ceil(remainingKrw / monthsRemaining). monthsRemaining 0이면 remainingKrw
  status: GoalStatus;
}

export function buildGoalProgress(input: {
  currentNetWorthKrw: number;
  targetNetWorthKrw: number;
  targetDate: string;  // "YYYY-MM-DD"
  todayIso: string;    // "YYYY-MM-DD" — 호출측(컴포넌트)이 계산해 주입
}): GoalProgress;
```

규칙:

- `remainingKrw = max(0, target - current)`.
- **입력 계약**: `targetDate`·`todayIso`는 잘 형성된 `YYYY-MM-DD`라고 가정한다(유효성은 `GoalForm`의 책임). 방어적으로, `targetDate`가 파싱 불가(형식 불일치/빈 문자열)면 `status="overdue"`, `monthsRemaining=0`, `monthlyRequiredKrw=remainingKrw`로 처리한다.
- `status`:
  - `achieved`: `current >= target`.
  - `overdue`: `achieved`가 아니고 (`targetDate < todayIso` **또는** `targetDate` 파싱 불가).
  - `active`: 그 외.
- **`monthsRemaining` 계산(정수, `Date` 미사용)** — 두 `YYYY-MM-DD`를 `(y, m, d)`로 파싱:
  - `base = (ty - cy) * 12 + (tm - cm)`  ← 일자 무시한 정수 개월 차.
  - `monthsRemaining = max(1, base + (td > cd ? 1 : 0))`  ← 남은 일수를 올림으로 반영(목표일 일자가 오늘 일자보다 크면 부분 달을 한 달로 올림).
  - 단 `overdue`(또는 파싱 불가)면 `0`. `achieved`면 계산값을 유지하되 월 적립은 표시하지 않는다.
  - **워크드 예시**(`todayIso` 기준):
    | today | target | base | td>cd? | monthsRemaining |
    |---|---|---|---|---|
    | 2026-07-10 | 2026-09-10 | 2 | 아니오 | 2 |
    | 2026-07-10 | 2026-09-20 | 2 | 예 | 3 |
    | 2026-07-31 | 2026-09-01 | 2 | 아니오 | 2 |
    | 2026-07-10 | 2026-07-20 | 0 | 예 | 1 |
    | 2026-07-10 | 2026-07-05 | — | — | 0 (overdue) |
- `monthlyRequiredKrw`: `monthsRemaining > 0`이면 `ceil(remainingKrw / monthsRemaining)`, 아니면 `remainingKrw`(기한 초과 시 남은 전액).
- `progressPct`: `target > 0`이면 `current / target * 100`, 아니면 0. `current`가 음수(부채>자산)면 음수가 그대로 나오며, 링 표시 측에서 0~100 클램프한다.

## UI

### 홈 페이지 `app/page.tsx`

`"use client"`. `DummyPage` 제거. `max-w-[480px]` 컨테이너(기존 화면과 동일 레이아웃).

1. **순자산 히어로 카드**(`Card variant="hero"`): 라벨 "순자산" + `PrivacyAmount`로 감싼 금액. 순자산은 공유 훅으로 계산.
2. **목표 섹션**:
   - 목표 **미설정** → `GoalEmptyState`: "목표 자산을 설정해 보세요" 안내 + "목표 설정하기" 버튼 → `GoalForm` 열기.
   - 목표 **설정됨** → `GoalCard`: 진행률 링 + 순자산/목표 라벨 + 남은 총금액 + "매월 OO원씩 모으면 돼요" + 남은 개월/목표일 + 수정·삭제 액션.
     - `achieved`: 링 100%, "목표를 달성했어요" 축하 문구, 월 적립 문구 대신 달성 표시.
     - `overdue`: 목표일 경과 안내 + 남은 총금액 유지, "목표일이 지났어요. 날짜를 다시 설정해 보세요".

잠금 상태에서는 자산 훅이 비활성(기존 패턴)이라 금액은 자연히 가려진다.

### 공유 순자산 훅 `lib/query/use-net-worth.ts`

자산 탭(`app/assets/page.tsx`)의 순자산 계산과 동일한 조합(주식+저축+연금+코인 − 부채)을 재사용 가능한 훅으로 추출한다.

```ts
export function useNetWorth(): { netWorthKrw: number; isLoading: boolean };
```

내부에서 `usePortfolio`·`useSavings`·`usePension`·`useCoin`·`useDebt`를 조합한다. 홈에서 사용한다. (자산 탭은 이번 범위에서 리팩터링하지 않고 기존 인라인 계산을 유지 — 회귀 위험 최소화. 중복은 인지된 트레이드오프.)

**`isLoading` 리듀스 규칙**: 5개 쿼리 중 **하나라도 로딩이면 `true`**. 잠금 상태에서는 모든 쿼리가 `enabled: !locked`로 비활성이라 로딩이 발생하지 않으므로 `isLoading=false`·`netWorthKrw=0`이 된다(금액은 상위 `PrivacyAmount`가 가림). 각 값은 기존 자산 탭과 동일하게 `?? 0` 폴백.

### 컴포넌트 `components/goal/`

- `GoalProgressRing.tsx`: 단일 진행률 SVG 링. props `{ pct: number; centerLabel?: string; centerValue?: string; size?; ariaLabel }`. `DonutChart`는 다중 세그먼트+범례 전용이라 재사용하지 않고 전용 링을 만든다. 진행 호는 DESIGN.md 브랜드색(`primary`), 트랙(배경 호)은 **DonutChart와 동일한 hairline 값을 하드코딩 재복제하지 말고 DESIGN.md의 hairline 토큰**을 사용. 금액은 증시 시맨틱(`up`/`down`) 아님 — 중립 `ink`. DESIGN.md에 진행률 링 규격/토큰이 아직 없으므로 이 컴포넌트 추가와 함께 DESIGN.md에 규격을 **추가한다**(조건부 아님).
- `GoalCard.tsx`: 링 + 수치 표시. `buildGoalProgress` 결과를 받아 렌더. 수정/삭제 버튼.
- `GoalForm.tsx`: 목표 금액(숫자 입력) + 목표 날짜(날짜 입력) 폼. 인라인(Dialog/시트). 기존 `TextInput` 등 프리미티브 재사용, 저장/삭제. 유효성: 금액 > 0, 날짜는 오늘 이후 권장(과거도 저장은 허용하되 overdue로 표시).
- `GoalEmptyState.tsx`: CTA 카드.

### 쿼리 훅 `lib/query/use-goal.ts`

```ts
export function useGoal();                 // getGoal 쿼리(잠금 시 비활성)
export function useGoalMutations();        // put/remove 뮤테이션 + goal 쿼리 무효화
```

## 백업

`lib/backup/backup.ts`에 `goal` 포함(수동 데이터):

- `BackupData`에 `goal: unknown[]` 추가.
- `exportAll`: `db.goal.toArray()` 추가(단일 행이라 배열 0~1개).
- `importAll`: `const goal = (data.goal ?? []) as ...`(구버전 백업엔 `goal` 없음 → `?? []` 기본값, 기존 `data.X ?? []` 패턴과 동일)로 정제 후 `db.goal.bulkPut`. `overwrite` 모드 삭제 목록에 `db.goal.clear()` 추가.
- `SCHEMA_VERSION`을 6으로 올리고 `SUPPORTED_VERSIONS`에 6 추가(구버전엔 `goal` 없음 → 무시되어 하위호환).
- `docs/backup.md` 표/버전 이력에 `goal` 반영.

## 문서 동기화

- `AGENTS.md` + `docs/architecture.md`: 홈 기능화, `goal` 테이블, `lib/goal`, `lib/query/use-goal`·`use-net-worth`, `components/goal`.
- `docs/backup.md`: `goal` 백업 포함 + payload v6.
- `DESIGN.md`: 신규 `GoalProgressRing` 규격/토큰이 기존 범위를 벗어나면 반영.

## 테스트

- `test/goal/goal-service.test.ts`(순수):
  - 남은 금액·진행률 기본값.
  - 월 적립액 = 남은금액 ÷ 남은개월(올림) 검증.
  - `monthsRemaining` 워크드 예시 표(위 5행) 그대로 케이스화.
  - `achieved`(current ≥ target), `overdue`(목표일 과거), 정상(active) 상태 전이.
  - 경계: 목표일이 이번 달/오늘, 개월 0, target ≤ 0, `current < 0`(음수 진행률), `targetDate` 파싱 불가.
- `test/backup/backup.test.ts`(기존 있으면 확장): 라운드트립에 `goal` 포함 확인.

## 오픈 이슈 / 트레이드오프

- 순자산 계산 중복(홈 훅 vs 자산 탭 인라인) — 이번엔 훅만 추가하고 자산 탭은 유지. 후속에서 통합 가능.
- `GoalForm` 세부(Dialog vs 바텀시트)와 날짜 입력 프리미티브는 구현 시 기존 manage 폼 패턴에 맞춰 확정.
