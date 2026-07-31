# 홈 순자산 + 목표 자산 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 탭에 순자산을 표기하고, 목표 순자산·목표 날짜를 설정하면 월 적립액·남은 총금액·진행률 링을 보여준다.

**Architecture:** 목표는 백업 대상 신규 Dexie 테이블 `goal`(단일 행)에 저장한다. 진척 계산은 순수 모듈 `lib/goal/goal-service.ts`(DB·Date 없음)에 두고 테스트한다. 홈은 공유 훅 `use-net-worth`로 순자산을 계산하고 `use-goal`로 목표 CRUD를 하며, `components/goal/*` + 전용 SVG `GoalProgressRing`으로 렌더한다.

**Tech Stack:** Next.js 16 App Router(`"use client"`), React 19, TypeScript, Dexie 4, @tanstack/react-query 5, Tailwind v4, vitest 4 + fake-indexeddb.

**참고 문서:** [스펙](../specs/2026-07-31-home-net-worth-goal-design.md) · [DESIGN.md](../../../DESIGN.md) · [backup.md](../../backup.md) · [architecture.md](../../architecture.md). UI 작업 전 반드시 DESIGN.md 확인.

---

## 파일 구조

- Create `lib/goal/goal-service.ts` — 순수 진척 계산.
- Create `test/goal/goal-service.test.ts` — 계산 테스트.
- Create `lib/query/use-net-worth.ts` — 순자산 공유 훅.
- Create `lib/query/use-goal.ts` — 목표 쿼리/뮤테이션 훅.
- Create `components/goal/GoalProgressRing.tsx` — 진행률 SVG 링.
- Create `components/goal/GoalCard.tsx` — 목표 진척 표시.
- Create `components/goal/GoalForm.tsx` — 목표 설정/수정 Dialog 폼.
- Create `components/goal/GoalEmptyState.tsx` — 미설정 CTA.
- Modify `lib/types.ts` — `Goal` 인터페이스 추가.
- Modify `lib/db/schema.ts` — v8 `goal` 스토어 + 테이블 필드.
- Modify `lib/db/local-store.ts` — `getGoal`/`putGoal`/`deleteGoal`.
- Modify `lib/backup/backup.ts` — `goal` 백업 포함, payload v6.
- Modify `test/backup/backup.test.ts` — 라운드트립에 `goal` 검증.
- Modify `app/page.tsx` — 홈 화면 조립.
- Modify `AGENTS.md` · `CLAUDE.md` · `docs/architecture.md` · `docs/backup.md` · `DESIGN.md` — 문서 동기화.

---

## Task 1: Goal 타입 + Dexie v8 + CRUD

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts:31-73`
- Modify: `lib/db/local-store.ts:61-62`

- [ ] **Step 1: `Goal` 인터페이스 추가** — `lib/types.ts`의 `Settings` 인터페이스 근처에 추가.

```ts
/** 순자산 목표(단일 행). 사용자가 직접 입력 → 백업 대상. */
export interface Goal {
  id: "goal";                 // 고정 키
  targetNetWorthKrw: number;  // 목표 순자산(원, > 0)
  targetDate: string;         // "YYYY-MM-DD"
  createdAt: number;          // epoch ms
}
```

- [ ] **Step 2: Dexie 스키마 v8 추가** — `lib/db/schema.ts`.

테이블 필드 선언(다른 `!: Table` 선언 옆):
```ts
  goal!: Table<Goal, string>; // key: id (순자산 목표, 단일 행)
```
`import type`에 `Goal` 추가. 생성자 끝(v7 `this.version(7)...` 뒤):
```ts
    // v8: 순자산 목표 테이블 추가 (docs/superpowers/specs/2026-07-31-home-net-worth-goal-design.md)
    this.version(8).stores({
      goal: "id",
    });
```

- [ ] **Step 3: CRUD 추가** — `lib/db/local-store.ts`의 `getSettings`/`putSettings` 근처.

```ts
export const getGoal = () => db.goal.get("goal");
export const putGoal = (g: Goal) => db.goal.put(g);
export const deleteGoal = () => db.goal.delete("goal");
```
`Goal` 타입 import 추가.

- [ ] **Step 4: 타입체크** — Run: `npm run typecheck` · Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/types.ts lib/db/schema.ts lib/db/local-store.ts
git commit -m "feat: 순자산 목표 저장용 goal 테이블(Dexie v8) 추가"
```

---

## Task 2: 순수 진척 계산 `goal-service` (TDD)

**Files:**
- Create: `lib/goal/goal-service.ts`
- Test: `test/goal/goal-service.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/goal/goal-service.test.ts`. 스펙의 워크드 예시 표를 그대로 케이스화.

```ts
import { describe, it, expect } from "vitest";
import { buildGoalProgress } from "@/lib/goal/goal-service";

const base = { currentNetWorthKrw: 5_000_000, targetNetWorthKrw: 10_000_000, targetDate: "2026-12-31", todayIso: "2026-07-10" };

describe("buildGoalProgress", () => {
  it("남은 금액·진행률을 계산한다", () => {
    const r = buildGoalProgress(base);
    expect(r.remainingKrw).toBe(5_000_000);
    expect(r.progressPct).toBe(50);
    expect(r.status).toBe("active");
  });

  it("월 적립액 = 남은금액 ÷ 남은개월(올림)", () => {
    // 2026-07-10 → 2026-12-31: base=5, d 31>10 → 6개월. ceil(5,000,000/6)=833,334
    const r = buildGoalProgress(base);
    expect(r.monthsRemaining).toBe(6);
    expect(r.monthlyRequiredKrw).toBe(833_334);
  });

  it.each([
    ["2026-07-10", "2026-09-10", 2],
    ["2026-07-10", "2026-09-20", 3],
    ["2026-07-31", "2026-09-01", 2],
    ["2026-07-10", "2026-07-20", 1],
  ])("monthsRemaining(%s→%s)=%i", (todayIso, targetDate, months) => {
    const r = buildGoalProgress({ ...base, todayIso, targetDate, currentNetWorthKrw: 0 });
    expect(r.monthsRemaining).toBe(months);
  });

  it("current ≥ target 이면 achieved", () => {
    const r = buildGoalProgress({ ...base, currentNetWorthKrw: 12_000_000 });
    expect(r.status).toBe("achieved");
    expect(r.remainingKrw).toBe(0);
  });

  it("목표일이 과거이면 overdue, monthsRemaining=0, 월적립=남은전액", () => {
    const r = buildGoalProgress({ ...base, targetDate: "2026-07-05" });
    expect(r.status).toBe("overdue");
    expect(r.monthsRemaining).toBe(0);
    expect(r.monthlyRequiredKrw).toBe(5_000_000);
  });

  it("targetDate 파싱 불가 → overdue 처리", () => {
    const r = buildGoalProgress({ ...base, targetDate: "" });
    expect(r.status).toBe("overdue");
    expect(r.monthsRemaining).toBe(0);
  });

  it("current 음수여도 진행률은 음수 그대로(표시 측 클램프)", () => {
    const r = buildGoalProgress({ ...base, currentNetWorthKrw: -1_000_000 });
    expect(r.progressPct).toBeLessThan(0);
    expect(r.remainingKrw).toBe(11_000_000);
  });

  it("target ≤ 0 이면 progressPct=0", () => {
    const r = buildGoalProgress({ ...base, targetNetWorthKrw: 0, currentNetWorthKrw: 0 });
    expect(r.progressPct).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `npx vitest run test/goal/goal-service.test.ts` · Expected: FAIL(모듈 없음).

- [ ] **Step 3: 최소 구현** — `lib/goal/goal-service.ts`.

```ts
export type GoalStatus = "active" | "achieved" | "overdue";

export interface GoalProgress {
  targetKrw: number;
  currentKrw: number;
  remainingKrw: number;       // max(0, target - current)
  progressPct: number;        // current/target*100 (음수·초과 그대로)
  monthsRemaining: number;    // 남은 개월(올림, 최소 1). overdue/파싱불가면 0
  monthlyRequiredKrw: number; // ceil(remaining / months). months 0이면 remaining
  status: GoalStatus;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** "YYYY-MM-DD"만 통과. 형식/범위 위반이면 null. */
function parseYmd(iso: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    return null;
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  return { y, m, d };
}

/**
 * 순자산 목표 진척. DB·Date·비동기 없이 입력만으로 계산한다.
 * `todayIso`는 호출측(컴포넌트)이 로컬 날짜로 계산해 주입한다.
 */
export function buildGoalProgress(input: {
  currentNetWorthKrw: number;
  targetNetWorthKrw: number;
  targetDate: string;
  todayIso: string;
}): GoalProgress {
  const current = input.currentNetWorthKrw;
  const target = input.targetNetWorthKrw;

  const remainingKrw = Math.max(0, target - current);
  const progressPct = target > 0 ? (current / target) * 100 : 0;

  const achieved = current >= target;
  const targetYmd = parseYmd(input.targetDate);
  const todayYmd = parseYmd(input.todayIso);
  const overdue =
    !achieved &&
    (targetYmd === null || todayYmd === null || input.targetDate < input.todayIso);

  let status: GoalStatus;
  if (achieved) {
    status = "achieved";
  } else if (overdue) {
    status = "overdue";
  } else {
    status = "active";
  }

  let monthsRemaining: number;
  if (overdue || targetYmd === null || todayYmd === null) {
    monthsRemaining = 0;
  } else {
    const baseMonths = (targetYmd.y - todayYmd.y) * 12 + (targetYmd.m - todayYmd.m);
    monthsRemaining = Math.max(1, baseMonths + (targetYmd.d > todayYmd.d ? 1 : 0));
  }

  const monthlyRequiredKrw =
    monthsRemaining > 0 ? Math.ceil(remainingKrw / monthsRemaining) : remainingKrw;

  return {
    targetKrw: target,
    currentKrw: current,
    remainingKrw,
    progressPct,
    monthsRemaining,
    monthlyRequiredKrw,
    status,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인** — Run: `npx vitest run test/goal/goal-service.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/goal/goal-service.ts test/goal/goal-service.test.ts
git commit -m "feat: 순자산 목표 진척 계산 순수 모듈 추가"
```

---

## Task 3: 백업에 goal 포함 (TDD)

**Files:**
- Modify: `lib/backup/backup.ts`
- Test: `test/backup/backup.test.ts`

- [ ] **Step 1: 실패 테스트 추가** — 기존 `test/backup/backup.test.ts`에 케이스 추가(파일 없으면 생성, 기존 라운드트립 테스트 패턴 따름).

```ts
it("goal을 export/import 라운드트립한다", async () => {
  await db.goal.put({ id: "goal", targetNetWorthKrw: 100_000_000, targetDate: "2027-01-01", createdAt: 1 });
  const json = await exportAll();
  await db.goal.clear();
  await importAll(json, { mode: "overwrite" });
  const restored = await db.goal.get("goal");
  expect(restored?.targetNetWorthKrw).toBe(100_000_000);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run test/backup/backup.test.ts` · Expected: FAIL.

- [ ] **Step 3: 구현** — `lib/backup/backup.ts`:
  - 헤더 주석에 `// v6: 순자산 목표(goal) 포함.` 추가.
  - `SCHEMA_VERSION = 6`, `SUPPORTED_VERSIONS = new Set([1, 2, 3, 4, 5, 6])`.
  - `BackupData`에 `goal: unknown[];` 추가.
  - `exportAll`의 `Promise.all`에 `db.goal.toArray()` 추가하고 payload `data`에 `goal` 포함.
  - `importAll`: `const goal = (data.goal ?? []) as Parameters<typeof db.goal.bulkPut>[0];`, `overwrite` 삭제 블록에 `await db.goal.clear();` 추가, 트랜잭션에 `await db.goal.bulkPut(goal);` 추가.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run test/backup/backup.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/backup/backup.ts test/backup/backup.test.ts
git commit -m "feat: 백업에 순자산 목표(goal) 포함 (payload v6)"
```

---

## Task 4: 쿼리 훅 (use-net-worth, use-goal)

**Files:**
- Create: `lib/query/use-net-worth.ts`
- Create: `lib/query/use-goal.ts`

- [ ] **Step 1: `use-net-worth.ts` 작성** — 자산 탭과 동일 조합, 잠금 시 각 쿼리 비활성.

```ts
"use client";

import { usePortfolio } from "./use-portfolio";
import { useSavings } from "./use-savings";
import { usePension } from "./use-pension";
import { useCoin } from "./use-coin";
import { useDebt } from "./use-debt";

/** 순자산(주식+저축+연금+코인 − 부채) 공유 훅. 잠금 시 0/false. */
export function useNetWorth(): { netWorthKrw: number; isLoading: boolean } {
  const portfolio = usePortfolio();
  const savings = useSavings();
  const pension = usePension();
  const coin = useCoin();
  const debt = useDebt();

  const total =
    (portfolio.data?.totalValueKrw ?? 0) +
    (savings.data?.totalKrw ?? 0) +
    (pension.data?.totalValueKrw ?? 0) +
    (coin.data?.totalValueKrw ?? 0);
  const netWorthKrw = total - (debt.data?.totalKrw ?? 0);

  const isLoading =
    portfolio.isLoading || savings.isLoading || pension.isLoading || coin.isLoading || debt.isLoading;

  return { netWorthKrw, isLoading };
}
```
> 실제 훅 파일명(`use-savings`·`use-pension`·`use-coin`·`use-debt`)은 `lib/query/` 실제 export 이름으로 확인 후 맞춘다.

- [ ] **Step 2: `use-goal.ts` 작성** — `use-asset-snapshots` 뮤테이션 패턴 따름.

```ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { getGoal, putGoal, deleteGoal } from "@/lib/db/local-store";
import type { Goal } from "@/lib/types";

const GOAL_KEY = ["goal"] as const;

/** 순자산 목표 단건. 잠금 상태에서는 비활성. */
export function useGoal() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: GOAL_KEY,
    enabled: !locked,
    staleTime: 30_000,
    queryFn: async () => (await getGoal()) ?? null,
  });
}

/** 목표 저장·삭제 뮤테이션. 성공 시 goal 쿼리 무효화. */
export function useGoalMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: GOAL_KEY });

  const save = useMutation({
    mutationFn: (input: { targetNetWorthKrw: number; targetDate: string }) => {
      const goal: Goal = { id: "goal", createdAt: Date.now(), ...input };
      return putGoal(goal);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => deleteGoal(),
    onSuccess: invalidate,
  });

  return { save, remove };
}
```

- [ ] **Step 3: 타입체크** — Run: `npm run typecheck` · Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add lib/query/use-net-worth.ts lib/query/use-goal.ts
git commit -m "feat: 순자산 공유 훅 + 목표 CRUD 훅 추가"
```

---

## Task 5: 진행률 링 컴포넌트 `GoalProgressRing`

**Files:**
- Create: `components/goal/GoalProgressRing.tsx`
- Modify: `DESIGN.md`

DESIGN.md 먼저 확인. 진행 호 = `primary`(#A87342), 트랙 = `hairline`(#F1ECE4) 토큰. `pct`는 0~100 클램프.

- [ ] **Step 1: 컴포넌트 작성**

```tsx
interface GoalProgressRingProps {
  pct: number;              // 0~100 클램프
  centerLabel?: string;
  centerValue?: string;
  size?: number;            // 기본 168
  ariaLabel: string;
}

const STROKE = 16;

/** 단일 진행률 SVG 링(목표 진척). 다중 세그먼트 도넛(DonutChart)과 별개. */
export function GoalProgressRing({ pct, centerLabel, centerValue, size = 168, ariaLabel }: GoalProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={ariaLabel} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-hairline" strokeWidth={STROKE} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-primary"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center gap-0.5">
        {centerLabel != null && <span className="text-[12px] text-muted">{centerLabel}</span>}
        {centerValue != null && (
          <span className="text-[22px] font-bold leading-[1.2] tabular-nums text-ink">{centerValue}</span>
        )}
      </div>
    </div>
  );
}
```
> Tailwind v4가 테마 색(`--color-primary`·`--color-hairline`)에서 `stroke-primary`·`stroke-hairline` 유틸을 생성한다. hex 하드코딩 금지(DESIGN 토큰과의 드리프트 방지).

- [ ] **Step 2: DESIGN.md에 규격 추가** — 진행률 링(지름 168, stroke 16, primary 호 + hairline 트랙, 중앙 라벨/값) 컴포넌트 규격을 컴포넌트 섹션에 기재.

- [ ] **Step 3: 타입체크/린트** — Run: `npm run typecheck && npm run lint` · Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add components/goal/GoalProgressRing.tsx DESIGN.md
git commit -m "feat: 목표 진행률 링 컴포넌트 추가"
```

---

## Task 6: GoalForm · GoalCard · GoalEmptyState

**Files:**
- Create: `components/goal/GoalForm.tsx`
- Create: `components/goal/GoalCard.tsx`
- Create: `components/goal/GoalEmptyState.tsx`

DESIGN.md의 카드·버튼·타이포·UX 라이팅(해요체) 준수. 금액은 중립 `ink`(증시 시맨틱 아님).

- [ ] **Step 1: `GoalEmptyState.tsx`** — `Card` + 안내 문구 + "목표 설정하기" `Button`. props `{ onSet: () => void }`.

- [ ] **Step 2: `GoalForm.tsx`** — `Dialog` 기반 인라인 폼. props `{ open, initial?: { targetNetWorthKrw; targetDate }, onClose, onSubmit, onDelete? }`.
  - 금액: `TextInput`(`type="number"`, `inputMode="numeric"`), 문자열 상태 → 저장 시 `Number`.
  - 날짜: `TextInput`(`type="date"`), 값 `YYYY-MM-DD`.
  - 유효성: 금액 > 0 & 날짜 비어있지 않음 → 아니면 액션 비활성. 과거 날짜는 허용(저장 후 overdue 표시).
  - 기존 목표 수정 시 `onDelete` 노출.

- [ ] **Step 3: `GoalCard.tsx`** — `buildGoalProgress` 결과 + 원본 goal을 받아 렌더. props `{ progress: GoalProgress; targetDate: string; onEdit: () => void }`.
  - `GoalProgressRing`(pct=progress.progressPct, centerLabel="목표까지", centerValue=`${round(pct)}%`).
  - `status`별 분기:
    - `active`: "매월 {formatKrw(monthlyRequiredKrw)}씩 모으면 돼요" + "목표까지 {formatKrw(remainingKrw)} 남았어요" + 목표일.
    - `achieved`: "목표를 달성했어요" 축하 + 링 100%.
    - `overdue`: "목표일이 지났어요. 날짜를 다시 설정해 보세요" + 남은 금액.
  - 우측 상단/하단에 "수정" 텍스트 버튼.

- [ ] **Step 4: 타입체크/린트** — Run: `npm run typecheck && npm run lint` · Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add components/goal/GoalForm.tsx components/goal/GoalCard.tsx components/goal/GoalEmptyState.tsx
git commit -m "feat: 목표 설정 폼·카드·빈 상태 컴포넌트 추가"
```

---

## Task 7: 홈 페이지 조립

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 홈 화면 구현** — `DummyPage` 제거.

구조:
```tsx
"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { GoalCard } from "@/components/goal/GoalCard";
import { GoalForm } from "@/components/goal/GoalForm";
import { GoalEmptyState } from "@/components/goal/GoalEmptyState";
import { useNetWorth } from "@/lib/query/use-net-worth";
import { useGoal, useGoalMutations } from "@/lib/query/use-goal";
import { buildGoalProgress } from "@/lib/goal/goal-service";
import { formatKrw } from "@/lib/format";
```
- `todayIso`: 로컬 날짜 `YYYY-MM-DD`를 컴포넌트에서 계산(`useMemo`로 1회). 예:
  ```ts
  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);
  ```
- 순자산 히어로 `Card variant="hero"`: 라벨 "순자산" + `PrivacyAmount`로 감싼 `formatKrw(netWorthKrw)`.
- 목표 섹션: `goal.data == null` → `GoalEmptyState` / 있으면 `buildGoalProgress`로 progress 계산 후 `GoalCard`.
- `GoalForm` 상태(open/편집). 저장 시 `save.mutate`, 삭제 시 `remove.mutate`.
- 레이아웃: `<main className="min-h-screen bg-canvas">` + `mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4`(기존 화면과 동일).

- [ ] **Step 2: 개발 서버로 육안 확인** — Run: `npm run dev` 후 홈(`/`)에서 순자산·빈 상태→설정→진척→수정/삭제 흐름 확인. (자동 검증 아님, 수동)

- [ ] **Step 3: 타입체크/린트/테스트** — Run: `npm run typecheck && npm run lint && npm test` · Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add app/page.tsx
git commit -m "feat: 홈에 순자산 표기 + 목표 자산 설정/진척 표시"
```

---

## Task 8: 문서 동기화

**Files:**
- Modify: `AGENTS.md` + `CLAUDE.md`(동일 유지), `docs/architecture.md`, `docs/backup.md`

- [ ] **Step 1: AGENTS.md/CLAUDE.md** — 디렉토리 요약에 홈 기능화, `lib/goal/`, `components/goal/`, `lib/query`(use-goal·use-net-worth), 핵심 규칙에 `goal` 테이블 언급. (두 파일 동일 내용 유지)

- [ ] **Step 2: docs/architecture.md** — 홈 탭 설명 갱신, `goal` 테이블·`lib/goal` 데이터 흐름 추가.

- [ ] **Step 3: docs/backup.md** — 백업 포함 테이블 표에 `goal` 추가, payload 버전 이력에 v6 추가.

- [ ] **Step 4: 최종 검증** — Run: `npm run typecheck && npm run lint && npm test` · Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add AGENTS.md CLAUDE.md docs/architecture.md docs/backup.md
git commit -m "docs: 홈 목표 기능 문서 동기화"
```

---

## 완료 기준

- 홈에서 순자산이 표기되고(`PrivacyAmount` 적용), 목표 미설정 시 CTA가 보인다.
- 목표(금액+날짜) 설정 시 진행률 링·남은 총금액·월 적립액이 정확히 표시된다.
- `achieved`/`overdue` 분기가 동작한다.
- 목표가 백업 export/import에 포함된다.
- `npm run typecheck && npm run lint && npm test` 전부 통과.
- 관련 문서(AGENTS·architecture·backup·DESIGN)가 코드와 일치.
