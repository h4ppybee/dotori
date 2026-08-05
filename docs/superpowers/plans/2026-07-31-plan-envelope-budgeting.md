# 계획 탭 서브 네비 + 통장 쪼개기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계획 탭을 자산 탭처럼 하단 서브 네비(플로팅 pill) 구조로 바꾸고, 첫 기능으로 통장 쪼개기(프로필별 항목 분류·통장/태그 롤업)를 추가한다.

**Architecture:** 자산 전용 `AssetSubTabBar`를 범용 `NestedTabBar`(탭·활성키 props)로 일반화해 자산·계획이 공유한다. 통장 쪼개기 데이터는 백업 대상 신규 Dexie 테이블 `envelopeItems`·`envelopeConfig`(v9)에 저장하고, 집계는 순수 모듈 `lib/envelope/envelope-service.ts`에서 계산한다. 화면은 `/plan`(통장쪼개기)·`/plan/realty`(플레이스홀더).

**Tech Stack:** Next.js 16 App Router(`"use client"`), React 19, TS strict, Dexie 4, @tanstack/react-query 5, Tailwind v4, vitest 4 + fake-indexeddb.

**참고:** [스펙](../specs/2026-07-31-plan-envelope-budgeting-design.md) · [DESIGN.md](../../../DESIGN.md) · [backup.md](../../backup.md). UI 작업 전 DESIGN.md 확인.

---

## 파일 구조

- Modify `components/nav/AssetSubTabBar.tsx` → rename `components/nav/NestedTabBar.tsx`(props로 일반화).
- Modify `components/nav/AppNav.tsx`(경로별 탭셋·활성키 선택), `components/nav/MainTabBar.tsx`(nest별 복귀 저장).
- Modify `lib/nav/nav-config.tsx`(planSubTabs + 아이콘 2종), `lib/nav/active.ts`(isPlanRoute·isNestedRoute·resolveActivePlanSub).
- Create `app/plan/realty/page.tsx`(DummyPage). Modify `app/plan/page.tsx`(Task 7에서 통장쪼개기).
- Create `test/nav/active.test.ts`(없으면) 또는 확장.
- Modify `lib/types.ts`(EnvelopeItem·EnvelopeConfig·EnvelopeProfile), `lib/db/schema.ts`(v9), `lib/db/local-store.ts`(CRUD).
- Create `lib/envelope/presets.ts`, `lib/envelope/envelope-service.ts`, `lib/envelope/tag-color.ts`.
- Create `test/envelope/envelope-service.test.ts`.
- Modify `lib/backup/backup.ts` + `test/backup/backup.test.ts`.
- Create `lib/query/use-envelope.ts`.
- Create `components/envelope/{ProfileSegment,EnvelopeItemRow,RollupCard,EnvelopeItemDialog}.tsx`.
- Modify docs: `AGENTS.md`, `docs/architecture.md`, `docs/backup.md`, `DESIGN.md`.

---

## Task 1: 네비게이션 일반화 + 계획 서브탭 스캐폴딩

**Files:**
- Rename/Modify: `components/nav/AssetSubTabBar.tsx` → `components/nav/NestedTabBar.tsx`
- Modify: `components/nav/AppNav.tsx`, `components/nav/MainTabBar.tsx`, `lib/nav/nav-config.tsx`, `lib/nav/active.ts`
- Create: `app/plan/realty/page.tsx`
- Test: `test/nav/active.test.ts`

- [ ] **Step 1: active.ts에 함수 추가 (테스트 먼저)** — `test/nav/active.test.ts`에 케이스 추가(파일 없으면 생성). 기존 테스트 스타일 확인 후 맞춘다.

```ts
import { describe, it, expect } from "vitest";
import { isPlanRoute, isNestedRoute, resolveActivePlanSub } from "@/lib/nav/active";

describe("plan nav", () => {
  it("isPlanRoute", () => {
    expect(isPlanRoute("/plan")).toBe(true);
    expect(isPlanRoute("/plan/realty")).toBe(true);
    expect(isPlanRoute("/assets")).toBe(false);
  });
  it("isNestedRoute = assets ∪ plan", () => {
    expect(isNestedRoute("/assets/stocks")).toBe(true);
    expect(isNestedRoute("/plan")).toBe(true);
    expect(isNestedRoute("/")).toBe(false);
  });
  it("resolveActivePlanSub", () => {
    expect(resolveActivePlanSub("/plan")).toBe("envelope");
    expect(resolveActivePlanSub("/plan/realty")).toBe("realty");
    expect(resolveActivePlanSub("/plan/anything")).toBe("envelope"); // catch-all
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run test/nav/active.test.ts` · Expected: FAIL(함수 없음).

- [ ] **Step 3: active.ts 구현** — `lib/nav/active.ts`에 추가:

```ts
export function isPlanRoute(pathname: string): boolean {
  return pathname === "/plan" || pathname.startsWith("/plan/");
}

/** 중첩 서브 네비(플로팅 pill)를 쓰는 라우트 = 자산 ∪ 계획. */
export function isNestedRoute(pathname: string): boolean {
  return isAssetsRoute(pathname) || isPlanRoute(pathname);
}

/** 활성 계획 서브탭 key. 자산의 "overview"와 달리 계획은 "envelope"가 곧 기본 탭이라 catch-all과 동일(의도된 차이). */
export function resolveActivePlanSub(pathname: string): string | null {
  if (!isPlanRoute(pathname)) {
    return null;
  }
  if (pathname === "/plan/realty" || pathname.startsWith("/plan/realty/")) {
    return "realty";
  }
  return "envelope";
}
```

- [ ] **Step 4: nav-config에 planSubTabs + 아이콘** — `lib/nav/nav-config.tsx`. 기존 stroke 아이콘 규칙대로 2종 추가(예: EnvelopeIcon=봉투, RealtyIcon=집). 그리고:

```ts
export const planSubTabs: TabDef[] = [
  { key: "envelope", href: "/plan", label: "통장 쪼개기", icon: EnvelopeIcon },
  { key: "realty", href: "/plan/realty", label: "부동산", icon: RealtyIcon },
];
```

- [ ] **Step 5: AssetSubTabBar → NestedTabBar 일반화** — 파일을 `NestedTabBar.tsx`로 옮기고(내용 이전), 시그니처를 props 기반으로 바꾼다. `assetSubTabs`/`resolveActiveSub` import 제거. `usePathname()`은 pendingKey 초기화용으로 **유지**.

```tsx
export function NestedTabBar({ visible, tabs, activeKey: activeKeyProp }: { visible: boolean; tabs: TabDef[]; activeKey: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const lastMainTabPath = useNavStore((s) => s.lastMainTabPath);

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingKey(null);
  }
  const activeKey = pendingKey ?? activeKeyProp;
  // ...나머지(페이드·pill·← 버튼·tabs.map) 기존 그대로, assetSubTabs → tabs로 치환
}
```

- [ ] **Step 6: AppNav 배선** — `components/nav/AppNav.tsx`:

```tsx
import { NestedTabBar } from "@/components/nav/NestedTabBar";
import { assetSubTabs, planSubTabs } from "@/lib/nav/nav-config";
import { isDetailRoute, isNestedRoute, isPlanRoute, resolveActiveSub, resolveActivePlanSub } from "@/lib/nav/active";
// ...
const nested = isNestedRoute(pathname);
const plan = isPlanRoute(pathname);
const tabs = plan ? planSubTabs : assetSubTabs;
const activeKey = plan ? resolveActivePlanSub(pathname) : resolveActiveSub(pathname);
const padBottom = nested ? "calc(56px + 24px + env(safe-area-inset-bottom))" : "calc(56px + env(safe-area-inset-bottom))";
return (
  <>
    <div style={{ paddingBottom: padBottom }}>{children}</div>
    <MainTabBar visible={!nested} />
    <NestedTabBar visible={nested} tabs={tabs} activeKey={activeKey} />
  </>
);
```

- [ ] **Step 7: MainTabBar 복귀 저장 nest별 판정** — `components/nav/MainTabBar.tsx` onClick 내부:

```ts
const enteringAssets = tab.key === "assets" && !isAssetsRoute(pathname);
const enteringPlan = tab.key === "plan" && !isPlanRoute(pathname);
if (enteringAssets || enteringPlan) {
  setLastMainTab(pathname);
}
```
`isPlanRoute` import 추가.

- [ ] **Step 8: 계획 하위 라우트** — `app/plan/realty/page.tsx` 생성:
```tsx
"use client";
import { DummyPage } from "@/components/nav/DummyPage";
export default function RealtyPage() {
  return <DummyPage title="부동산 조달계획" />;
}
```
(`app/plan/page.tsx`는 Task 7까지 기존 DummyPage 유지 — 그래도 서브 네비는 뜬다.)

- [ ] **Step 9: 기존 AssetSubTabBar 테스트 이관** — 파일 rename의 소비자는 `AppNav` **외에** 테스트도 있다: `test/ui/AssetSubTabBar.test.tsx`가 `@/components/nav/AssetSubTabBar`를 import하고 prop 없는 옛 시그니처로 렌더한다. 이 파일을 `test/ui/NestedTabBar.test.tsx`로 옮기고 import를 `NestedTabBar`로, 렌더를 명시 props로 바꾼다:
```tsx
import { NestedTabBar } from "@/components/nav/NestedTabBar";
import { assetSubTabs } from "@/lib/nav/nav-config";
// render(<NestedTabBar visible tabs={assetSubTabs} activeKey="stocks" />)
```
낙관적 활성 테스트(pendingKey가 activeKey를 덮는 케이스)는 그대로 유효.

- [ ] **Step 10: 검증** — Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS(nav·NestedTabBar 테스트 포함). 자산 탭 회귀 없어야 함(active 테스트가 방어).

- [ ] **Step 11: Commit**
```bash
git add components/nav lib/nav app/plan test/nav test/ui
git commit -m "feat: 자산 서브탭 바를 범용 NestedTabBar로 일반화 + 계획 탭 서브 네비 추가

- AssetSubTabBar → NestedTabBar(tabs·activeKey props)
- planSubTabs(통장 쪼개기·부동산) + isPlanRoute/isNestedRoute/resolveActivePlanSub
- MainTabBar 복귀 저장을 nest별로 판정, /plan/realty 플레이스홀더

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 데이터 모델 (타입 + Dexie v9 + 프리셋 + CRUD)

**Files:**
- Modify: `lib/types.ts`, `lib/db/schema.ts`, `lib/db/local-store.ts`
- Create: `lib/envelope/presets.ts`

- [ ] **Step 1: 타입 추가** — `lib/types.ts`:
```ts
export type EnvelopeProfile = "wife" | "husband";

/** 통장 쪼개기 라인 항목. 사용자가 직접 입력 → 백업 대상. */
export interface EnvelopeItem {
  id: string;
  profile: EnvelopeProfile;
  tag: string;
  account: string;
  name: string;
  amountKrw: number;   // ≥ 0
  note?: string;
  sortOrder: number;
  createdAt: number;
}

/** 통장 쪼개기 커스텀 태그·은행(단일 행). */
export interface EnvelopeConfig {
  id: "envelope";
  customTags: string[];
  customAccounts: string[];
}
```

- [ ] **Step 2: 프리셋 상수** — `lib/envelope/presets.ts`:
```ts
export const TAG_PRESETS = ["고정지출", "저축", "투자", "생활비", "비상금"] as const;
export const ACCOUNT_PRESETS = ["신한", "토스", "케이뱅크", "하나당근", "국민", "신용카드(현대)", "신용카드(삼성)"] as const;

/** 프리셋 ∪ 커스텀(중복 제거, 프리셋 우선 순서). */
export function mergePresets(presets: readonly string[], custom: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...presets, ...custom]) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
```

- [ ] **Step 3: Dexie v9** — `lib/db/schema.ts`. `import type`에 `EnvelopeItem`·`EnvelopeConfig` 추가, 필드 선언:
```ts
  envelopeItems!: Table<EnvelopeItem, string>;   // key: id (통장 쪼개기 항목)
  envelopeConfig!: Table<EnvelopeConfig, string>; // key: id (커스텀 태그·은행)
```
생성자 v8 뒤:
```ts
    // v9: 통장 쪼개기 테이블 추가 (docs/superpowers/specs/2026-07-31-plan-envelope-budgeting-design.md)
    this.version(9).stores({
      envelopeItems: "id, profile, sortOrder",
      envelopeConfig: "id",
    });
```

- [ ] **Step 4: CRUD** — `lib/db/local-store.ts`(savings 패턴 차용, `uid`/`now` 기존 헬퍼 사용). `EnvelopeItem`·`EnvelopeConfig`·`EnvelopeProfile` import 추가.
```ts
export const listEnvelopeItems = () => db.envelopeItems.toArray();
export const getEnvelopeItem = (id: string) => db.envelopeItems.get(id);

async function nextEnvelopeSortOrder(profile: EnvelopeProfile): Promise<number> {
  const rows = await db.envelopeItems.where("profile").equals(profile).toArray();
  return rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
}

export async function upsertEnvelopeItem(
  s: Partial<EnvelopeItem> & { id?: string; profile: EnvelopeProfile },
): Promise<EnvelopeItem> {
  const existing = s.id ? await db.envelopeItems.get(s.id) : undefined;
  const sortOrder = s.sortOrder ?? existing?.sortOrder ?? (await nextEnvelopeSortOrder(s.profile));
  const rec = { ...existing, ...s, id: s.id ?? uid(), sortOrder, createdAt: existing?.createdAt ?? now() } as EnvelopeItem;
  await db.envelopeItems.put(rec);
  return rec;
}

export const deleteEnvelopeItem = (id: string) => db.envelopeItems.delete(id);

const DEFAULT_ENVELOPE_CONFIG: EnvelopeConfig = { id: "envelope", customTags: [], customAccounts: [] };
export const getEnvelopeConfig = async (): Promise<EnvelopeConfig> =>
  (await db.envelopeConfig.get("envelope")) ?? DEFAULT_ENVELOPE_CONFIG;
export const putEnvelopeConfig = (c: EnvelopeConfig) => db.envelopeConfig.put(c);
```
> `uid`/`now` 헬퍼가 이 파일에 이미 있는지 확인하고 동일 사용(savings가 씀).

- [ ] **Step 5: 검증** — Run: `npm run typecheck && npm run lint` · Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add lib/types.ts lib/db/schema.ts lib/db/local-store.ts lib/envelope/presets.ts
git commit -m "feat: 통장 쪼개기 데이터 모델(Dexie v9) + 프리셋 + CRUD 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 순수 계산 envelope-service (TDD)

**Files:**
- Create: `lib/envelope/envelope-service.ts`
- Test: `test/envelope/envelope-service.test.ts`

- [ ] **Step 1: 실패 테스트** — `test/envelope/envelope-service.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildEnvelopeView } from "@/lib/envelope/envelope-service";
import type { EnvelopeItem } from "@/lib/types";

const mk = (o: Partial<EnvelopeItem>): EnvelopeItem => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  profile: o.profile ?? "wife",
  tag: o.tag ?? "저축",
  account: o.account ?? "신한",
  name: o.name ?? "항목",
  amountKrw: o.amountKrw ?? 0,
  sortOrder: o.sortOrder ?? 0,
  createdAt: 0,
  note: o.note,
});

const items: EnvelopeItem[] = [
  mk({ profile: "wife", tag: "저축", account: "신한", amountKrw: 700_000, sortOrder: 0 }),
  mk({ profile: "wife", tag: "생활비", account: "하나당근", amountKrw: 300_000, sortOrder: 1 }),
  mk({ profile: "husband", tag: "투자", account: "토스", amountKrw: 1_200_000, sortOrder: 0 }),
];

describe("buildEnvelopeView", () => {
  it("프로필 뷰: 총액·비율·항목 rows(sortOrder 순)", () => {
    const v = buildEnvelopeView({ items, scope: "wife" });
    expect(v.totalKrw).toBe(1_000_000);
    expect(v.rows.map((r) => r.item.tag)).toEqual(["저축", "생활비"]);
    expect(v.rows[0].ratioPct).toBe(70);
    expect(v.byProfile).toEqual([]);
  });

  it("태그/통장 롤업: 금액 내림차순, 키 tiebreaker", () => {
    const v = buildEnvelopeView({ items, scope: "wife" });
    expect(v.byTag[0]).toMatchObject({ key: "저축", amountKrw: 700_000, ratioPct: 70 });
    expect(v.byTag[1]).toMatchObject({ key: "생활비", amountKrw: 300_000 });
    expect(v.byAccount.map((e) => e.key)).toEqual(["신한", "하나당근"]);
  });

  it("통합: 전체 합산 + byProfile, rows는 빈 배열", () => {
    const v = buildEnvelopeView({ items, scope: "combined" });
    expect(v.totalKrw).toBe(2_200_000);
    expect(v.rows).toEqual([]);
    expect(v.byProfile.find((e) => e.key === "husband")?.amountKrw).toBe(1_200_000);
    expect(v.byTag.map((e) => e.key)).toEqual(["투자", "저축", "생활비"]); // 1.2M,0.7M,0.3M
  });

  it("빈 목록: total 0, 배열 비고 ratio 0", () => {
    const v = buildEnvelopeView({ items: [], scope: "wife" });
    expect(v.totalKrw).toBe(0);
    expect(v.byTag).toEqual([]);
    expect(v.rows).toEqual([]);
  });

  it("total 0(0원 항목만): ratio 0, 그룹은 표시", () => {
    const zero = [mk({ profile: "wife", tag: "저축", amountKrw: 0 })];
    const v = buildEnvelopeView({ items: zero, scope: "wife" });
    expect(v.totalKrw).toBe(0);
    expect(v.byTag).toHaveLength(1);
    expect(v.byTag[0]).toMatchObject({ key: "저축", amountKrw: 0, ratioPct: 0 });
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run test/envelope/envelope-service.test.ts` · Expected: FAIL.

- [ ] **Step 3: 구현** — `lib/envelope/envelope-service.ts`:
```ts
import type { EnvelopeItem, EnvelopeProfile } from "@/lib/types";

export interface EnvelopeRollupEntry { key: string; amountKrw: number; ratioPct: number; }
export interface EnvelopeItemRow { item: EnvelopeItem; ratioPct: number; }

export interface EnvelopeView {
  scope: "combined" | EnvelopeProfile;
  totalKrw: number;
  rows: EnvelopeItemRow[];
  byTag: EnvelopeRollupEntry[];
  byAccount: EnvelopeRollupEntry[];
  byProfile: EnvelopeRollupEntry[];
}

function ratio(amount: number, total: number): number {
  return total > 0 ? (amount / total) * 100 : 0;
}

/** key별 합계 → 금액 내림차순, 동점이면 key 오름차순. */
function rollup(items: EnvelopeItem[], keyOf: (i: EnvelopeItem) => string, total: number): EnvelopeRollupEntry[] {
  const sums = new Map<string, number>();
  for (const it of items) {
    sums.set(keyOf(it), (sums.get(keyOf(it)) ?? 0) + it.amountKrw);
  }
  return [...sums.entries()]
    .map(([key, amountKrw]) => ({ key, amountKrw, ratioPct: ratio(amountKrw, total) }))
    .sort((a, b) => b.amountKrw - a.amountKrw || a.key.localeCompare(b.key));
}

export function buildEnvelopeView(input: { items: EnvelopeItem[]; scope: "combined" | EnvelopeProfile }): EnvelopeView {
  const { items, scope } = input;
  const target = scope === "combined" ? items : items.filter((i) => i.profile === scope);
  const totalKrw = target.reduce((s, i) => s + i.amountKrw, 0);

  const rows = scope === "combined"
    ? []
    : [...target]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({ item, ratioPct: ratio(item.amountKrw, totalKrw) }));

  const byProfile = scope === "combined" ? rollup(target, (i) => i.profile, totalKrw) : [];

  return {
    scope,
    totalKrw,
    rows,
    byTag: rollup(target, (i) => i.tag, totalKrw),
    byAccount: rollup(target, (i) => i.account, totalKrw),
    byProfile,
  };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run test/envelope/envelope-service.test.ts` · Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add lib/envelope/envelope-service.ts test/envelope/envelope-service.test.ts
git commit -m "feat: 통장 쪼개기 집계 순수 모듈(비율·태그/통장/인물 롤업) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 백업에 envelope 포함 (TDD)

**Files:**
- Modify: `lib/backup/backup.ts`
- Test: `test/backup/backup.test.ts`

- [ ] **Step 1: 실패 테스트** — `test/backup/backup.test.ts`에 추가(기존 goal 라운드트립 테스트 스타일 참고):
```ts
it("envelope 항목·config를 export/import 라운드트립한다", async () => {
  await db.envelopeItems.put({ id: "e1", profile: "wife", tag: "저축", account: "신한", name: "청년도약", amountKrw: 700_000, sortOrder: 0, createdAt: 1 });
  await db.envelopeConfig.put({ id: "envelope", customTags: ["경조사"], customAccounts: ["카카오뱅크"] });
  const json = await exportAll();
  await db.envelopeItems.clear();
  await db.envelopeConfig.clear();
  await importAll(json, { mode: "overwrite" });
  expect((await db.envelopeItems.get("e1"))?.amountKrw).toBe(700_000);
  expect((await db.envelopeConfig.get("envelope"))?.customTags).toEqual(["경조사"]);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run test/backup/backup.test.ts` · Expected: FAIL.

- [ ] **Step 3: 구현** — `lib/backup/backup.ts`(goal이 추가된 방식과 동일):
  - 버전 주석 `// v7: 통장 쪼개기(envelopeItems·envelopeConfig) 포함.`
  - `SCHEMA_VERSION = 7`, `SUPPORTED_VERSIONS = new Set([1,2,3,4,5,6,7])`.
  - `BackupData`에 `envelopeItems: unknown[]; envelopeConfig: unknown[];`.
  - `exportAll`: `db.envelopeItems.toArray()`·`db.envelopeConfig.toArray()`를 Promise.all + payload.data.
  - `importAll`: `const envelopeItems = (data.envelopeItems ?? []) as ...; const envelopeConfig = (data.envelopeConfig ?? []) as ...;` overwrite 삭제 블록에 두 `clear()`, 트랜잭션에 두 `bulkPut`.

- [ ] **Step 4: 기존 하드코딩 assertion 갱신** — `test/backup/backup.test.ts`에 `schemaVersion`을 6으로 단언하는 곳이 **2군데**(대략 `:68` `expect(parsed.schemaVersion).toBe(6)`, `:85` `expect(JSON.parse(json).schemaVersion).toBe(6)`) 있다. 둘 다 `toBe(7)`로 갱신한다(안 하면 `npm test`가 깨진다). 실제 줄 번호는 grep으로 확인.

- [ ] **Step 5: 통과 확인 + 전체** — Run: `npx vitest run test/backup/backup.test.ts` 후 `npm test` · Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add lib/backup/backup.ts test/backup/backup.test.ts
git commit -m "feat: 백업에 통장 쪼개기(envelope) 포함 (payload v7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 쿼리 훅 use-envelope

**Files:**
- Create: `lib/query/use-envelope.ts`

- [ ] **Step 1: 작성** — `use-asset-snapshots`/`use-goal` 뮤테이션 패턴 차용.
```ts
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import {
  listEnvelopeItems, upsertEnvelopeItem, deleteEnvelopeItem,
  getEnvelopeConfig, putEnvelopeConfig,
} from "@/lib/db/local-store";
import type { EnvelopeItem, EnvelopeConfig } from "@/lib/types";

const ITEMS_KEY = ["envelopeItems"] as const;
const CONFIG_KEY = ["envelopeConfig"] as const;

export function useEnvelopeItems() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ queryKey: ITEMS_KEY, enabled: !locked, staleTime: 30_000, queryFn: listEnvelopeItems });
}
export function useEnvelopeConfig() {
  const locked = useAppStore((s) => s.locked);
  return useQuery({ queryKey: CONFIG_KEY, enabled: !locked, staleTime: 30_000, queryFn: getEnvelopeConfig });
}

export function useEnvelopeMutations() {
  const qc = useQueryClient();
  const invalidateItems = () => qc.invalidateQueries({ queryKey: ITEMS_KEY });
  const invalidateConfig = () => qc.invalidateQueries({ queryKey: CONFIG_KEY });

  const save = useMutation({
    mutationFn: (input: Partial<EnvelopeItem> & { id?: string; profile: EnvelopeItem["profile"] }) => upsertEnvelopeItem(input),
    onSuccess: invalidateItems,
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteEnvelopeItem(id), onSuccess: invalidateItems });

  // 커스텀 태그/은행 추가(중복 무시). config 갱신만.
  const addCustom = useMutation({
    mutationFn: async (v: { kind: "tag" | "account"; value: string }) => {
      const cfg = await getEnvelopeConfig();
      const list = v.kind === "tag" ? cfg.customTags : cfg.customAccounts;
      if (list.includes(v.value)) { return cfg; }
      const next: EnvelopeConfig = v.kind === "tag"
        ? { ...cfg, customTags: [...cfg.customTags, v.value] }
        : { ...cfg, customAccounts: [...cfg.customAccounts, v.value] };
      await putEnvelopeConfig(next);
      return next;
    },
    onSuccess: invalidateConfig,
  });

  return { save, remove, addCustom };
}
```

- [ ] **Step 2: 검증** — Run: `npm run typecheck && npm run lint` · Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add lib/query/use-envelope.ts
git commit -m "feat: 통장 쪼개기 쿼리·뮤테이션 훅 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 컴포넌트 (태그색 + ProfileSegment·RollupCard·EnvelopeItemRow·EnvelopeItemDialog)

**Files:**
- Create: `lib/envelope/tag-color.ts`, `components/envelope/{ProfileSegment,RollupCard,EnvelopeItemRow,EnvelopeItemDialog}.tsx`

DESIGN.md 먼저 확인. 금액 중립 `text-ink`. 프리미티브(`Card`·`Button`·`Dialog`·`TextInput`·`Chip`) 재사용.

- [ ] **Step 1: 태그색** — `lib/envelope/tag-color.ts`. `DonutChart` 팔레트(`["#A87342","#F04452","#15803D","#FF9800","#8B5CF6","#6B7684"]`)를 프리셋 태그에 고정 배정, 커스텀은 순환.
```ts
import { TAG_PRESETS } from "./presets";
const PALETTE = ["#A87342", "#F04452", "#15803D", "#FF9800", "#8B5CF6", "#6B7684"];
export function tagColor(tag: string): string {
  const i = TAG_PRESETS.indexOf(tag as (typeof TAG_PRESETS)[number]);
  if (i >= 0) { return PALETTE[i % PALETTE.length]; }
  // 커스텀: 문자열 해시로 팔레트 순환(결정적)
  let h = 0;
  for (const ch of tag) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; }
  return PALETTE[h % PALETTE.length];
}
```

- [ ] **Step 2: ProfileSegment** — 세그먼트 컨트롤. props `{ value: "combined"|"wife"|"husband"; onChange }`. 통합/아내/남편 3버튼, 활성=primary 톤. DESIGN 토큰.

- [ ] **Step 3: RollupCard** — props `{ title: string; entries: EnvelopeRollupEntry[]; colored?: boolean }`. `Card` + 각 행(키·금액·비율%). `colored`면 키 앞 태그색 dot. 금액 `text-ink tabular-nums`.

- [ ] **Step 4: EnvelopeItemRow** — props `{ row: EnvelopeItemRow; onEdit }`. 항목명 + 태그 칩(색) + 통장 + 금액 + 비율%. 탭 → onEdit.

- [ ] **Step 5: EnvelopeItemDialog** — `Dialog` 기반. props `{ open, profile, initial?, tags: string[], accounts: string[], onClose, onSubmit, onDelete?, onAddTag, onAddAccount, submitting? }`.
  - 필드: 항목명(TextInput), 금액(TextInput numeric, 원), 태그(칩 선택 + "직접 추가"), 통장(칩 선택 + "직접 추가"), 비고(선택).
  - 유효성: 항목명 non-empty & 금액 ≥ 0 & 태그·통장 선택.
  - **초기값은 mount 시 props에서 1회**(effect 내 setState 금지). 부모가 open 전환/편집 대상으로 key 재마운트. **커스텀 추가(onAddTag/onAddAccount)는 key를 바꾸지 않음** — tags/accounts는 live prop.
  - 삭제: 편집 모드에서 `text-up` 텍스트 버튼.

- [ ] **Step 6: 검증** — Run: `npm run typecheck && npm run lint` · Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add lib/envelope/tag-color.ts components/envelope
git commit -m "feat: 통장 쪼개기 컴포넌트(세그먼트·롤업·항목행·항목 Dialog) + 태그색 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 통장쪼개기 화면 조립 `app/plan/page.tsx`

**Files:**
- Modify: `app/plan/page.tsx`

- [ ] **Step 1: 화면 구현** — `DummyPage` 제거.
  - `"use client"`. 컨테이너 `mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4`.
  - `const [scope, setScope] = useState<"combined"|"wife"|"husband">("combined");`
  - `const items = useEnvelopeItems().data ?? [];` `const config = useEnvelopeConfig().data;`
  - `const view = useMemo(() => buildEnvelopeView({ items, scope }), [items, scope]);`
  - 사용 가능한 태그/은행 = `mergePresets(TAG_PRESETS, config?.customTags ?? [])`, `mergePresets(ACCOUNT_PRESETS, config?.customAccounts ?? [])`.
  - 상단 `ProfileSegment`.
  - `scope !== "combined"`: 총액 카드 + 태그 `DonutChart`(segments=byTag → {label,value,pct,color:tagColor}) + 항목 리스트(view.rows.map → EnvelopeItemRow) + "+ 항목 추가" + RollupCard 통장별·태그별.
  - `scope === "combined"`: 총액 + RollupCard 태그별(colored)·통장별·인물별(인물 key "wife"/"husband" → "아내"/"남편" 라벨 매핑).
  - `EnvelopeItemDialog` 배선: `save.mutate({ ...values, profile: scope==="combined" ? "wife" : scope }, { onSuccess: close })` — 통합에선 추가 버튼 없음이므로 profile은 항상 wife/husband. 편집 시 initial 전달. onDelete=remove.mutate(id). onAddTag/onAddAccount=addCustom.mutate. key 재마운트 계약 준수(GoalForm처럼 open+편집 항목 id 기반 key).
  - 잠금 시 훅 비활성 → 빈 화면 자연 처리.

- [ ] **Step 2: 육안 확인** — Run: `npm run dev` → `/plan`에서 세그먼트 전환·항목 추가/수정/삭제·롤업·통합 뷰 확인(수동).

- [ ] **Step 3: 검증** — Run: `npm run typecheck && npm run lint && npm test` · Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add app/plan/page.tsx
git commit -m "feat: 통장 쪼개기 화면(프로필 세그먼트·도넛·항목·롤업) 조립

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 문서 동기화

**Files:**
- Modify: `AGENTS.md`(CLAUDE.md는 @AGENTS.md 참조라 편집 불필요), `docs/architecture.md`, `docs/backup.md`, `DESIGN.md`

- [ ] **Step 1: AGENTS.md** — 계획 탭 기능화(통장 쪼개기·부동산 플레이스홀더), nav 일반화(`NestedTabBar`), `lib/envelope`·`components/envelope`·`use-envelope`, `envelopeItems`·`envelopeConfig` 테이블(백업 포함) 반영. `app/` 메인 탭에서 `plan` 설명 갱신, `components/`에 `envelope/`, `lib/`에 `envelope/`·query 훅 추가.
- [ ] **Step 2: docs/architecture.md** — 계획 탭·nav 구조(NestedTabBar 공유)·envelope 데이터 흐름·v9 테이블 반영.
- [ ] **Step 3: docs/backup.md** — envelopeItems·envelopeConfig 백업 포함 행 + payload v7 이력.
- [ ] **Step 4: DESIGN.md** — `ProfileSegment` 규격 + 태그 색 매핑 규칙 추가.
- [ ] **Step 5: 최종 검증** — Run: `npm run typecheck && npm run lint && npm test` · Expected: PASS.
- [ ] **Step 6: Commit**
```bash
git add AGENTS.md docs/architecture.md docs/backup.md DESIGN.md
git commit -m "docs: 계획 탭 서브 네비 + 통장 쪼개기 문서 동기화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 완료 기준

- 계획 탭 진입 시 자산 탭과 동일한 플로팅 서브 네비(통장 쪼개기·부동산)가 뜨고, ← 복귀가 올바르다.
- `/plan`에서 프로필(통합/아내/남편) 전환, 항목 추가/수정/삭제, 통장별·태그별·인물별 롤업과 비율이 정확히 표시된다.
- 태그·은행 프리셋 + 직접 추가가 동작한다.
- envelope 테이블이 백업 export/import에 포함된다.
- 자산 탭 회귀 없음. `npm run typecheck && npm run lint && npm test` 전부 통과.
- 관련 문서(AGENTS·architecture·backup·DESIGN) 코드와 일치.
