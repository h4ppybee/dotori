# 자산 스냅샷 기록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자산 탭에서 버튼 한 번으로 전체 자산 상태(주식·저축·연금·코인·부채, 손익 포함)를 스냅샷으로 저장하고, 콤보 차트(순자산 선 + 변화량 막대)·목록·상세·삭제를 제공한다.

**Architecture:** 화면이 쓰는 5개 뷰모델(PortfolioVM·SavingsVM·PensionVM·CoinVM·DebtVM)을 순수 빌더로 직렬화해 새 Dexie 테이블 `assetSnapshots`(v7)에 1건으로 저장한다. 조회는 재계산 없이 저장값 그대로 표시. 기존 주식 전용 일별 자동 스냅샷은 제거(테이블·과거 데이터는 유지).

**Tech Stack:** Next.js 16 App Router("use client"), React 19, Dexie 4, @tanstack/react-query 5, Tailwind v4, vitest + fake-indexeddb.

**Spec:** [docs/superpowers/specs/2026-07-02-asset-snapshot-design.md](../specs/2026-07-02-asset-snapshot-design.md)

**사전 준비 (Task 0):** `dtr-deploy` 흐름에 따라 `superpowers:using-git-worktrees`로 worktree를 만들고 브랜치 `feat/asset-snapshot`에서 작업한다. 완료 후 PR 생성(Vercel 프리뷰). **push·PR·머지 전 반드시 사용자 확인.**

**공통 규칙 리마인드:** if/else 본문은 한 줄이어도 중괄호. 중첩 대신 early return. UI 작업 전 DESIGN.md 필독. 커밋 메시지는 기존 컨벤션(`feat:`/`docs:`/`test:` + 한국어 요약).

---

## File Structure

```
lib/types.ts                              (수정) AssetSnapshot 타입 4종 추가
lib/db/schema.ts                          (수정) v7 assetSnapshots 테이블
lib/db/local-store.ts                     (수정) 스냅샷 CRUD 4개
lib/snapshot/asset-snapshot.ts            (생성) 순수 빌더 buildAssetSnapshot
lib/snapshot/capture.ts                   (생성) DB 읽기→VM 5종 빌드→저장 (captureAssetSnapshot)
lib/snapshot/trend.ts                     (생성) 차트용 순수 헬퍼 buildTrendData
lib/snapshot/snapshot-service.ts          (삭제) 구 일별 자동 스냅샷
lib/backup/backup.ts                      (수정) assetSnapshots export/import, v5
lib/format.ts                             (수정) formatDateTime 추가
lib/query/use-asset-snapshots.ts          (생성) 목록/단건 쿼리 + 기록/삭제 mutation
components/snapshot/SnapshotTrendChart.tsx (생성) 콤보 차트(SVG)
components/snapshot/SnapshotSection.tsx    (생성) 자산 탭 하단 섹션
components/snapshot/SnapshotListItem.tsx   (생성) 목록 행(섹션·전체 목록 공용)
app/assets/page.tsx                       (수정) SnapshotSection 삽입
app/assets/stocks/page.tsx                (수정) 자동 스냅샷 호출 제거
app/assets/snapshots/page.tsx             (생성) 전체 목록
app/assets/snapshots/[id]/page.tsx        (생성) 상세 + 삭제
test/snapshot/asset-snapshot.test.ts      (생성) 빌더 테스트
test/snapshot/capture.test.ts             (생성) 캡처 통합 테스트(fake-indexeddb)
test/snapshot/trend.test.ts               (생성) 차트 헬퍼 테스트
test/snapshot/snapshot-service.test.ts    (삭제)
test/db/schema.test.ts                    (수정) v7 확인
test/db/local-store.test.ts               (수정) CRUD 테스트 추가
test/backup/*                             (수정) assetSnapshots 라운드트립
test/format.test.ts                       (수정) formatDateTime
docs/architecture.md, docs/backup.md, AGENTS.md, DESIGN.md (수정) 문서 동기화
```

---

### Task 0: Worktree 준비

- [ ] **Step 1:** `superpowers:using-git-worktrees` 스킬로 worktree 생성, 브랜치명 `feat/asset-snapshot`.
- [ ] **Step 2:** worktree에서 `npm install` 없이 기존 `node_modules` 링크가 없으면 `npm ci`. `npm test` 1회 실행해 그린 상태 확인.

### Task 1: 타입 + Dexie v7

**Files:**
- Modify: `lib/types.ts` (파일 끝 `Settings` 위쪽 아무 곳, `LoanAccount` 뒤 권장)
- Modify: `lib/db/schema.ts`
- Test: `test/db/schema.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — `test/db/schema.test.ts`의 `describe("db schema")` 안에:

```typescript
it("exposes assetSnapshots store (v7)", async () => {
  expect(db.assetSnapshots).toBeDefined();
  await db.assetSnapshots.put({
    id: "s1", createdAt: 1000, netWorthKrw: 900, totalAssetsKrw: 1000, totalDebtKrw: 100,
    stocks: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
    pension: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
    coin: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
    savings: { totalKrw: 0, rows: [] },
    debt: { totalKrw: 100, rows: [{ name: "대출", amountKrw: 100 }] },
  });
  const got = await db.assetSnapshots.get("s1");
  expect(got?.netWorthKrw).toBe(900);
});
```

- [ ] **Step 2:** `npx vitest run test/db/schema.test.ts` → FAIL (`assetSnapshots` undefined / 타입 에러).
- [ ] **Step 3: 타입 추가** — `lib/types.ts`의 `LoanAccount` 정의 뒤에:

```typescript
/** 주식·연금·코인 공용 스냅샷 상세 행 (스냅샷 시점 값 고정, KRW). */
export interface AssetSnapshotRow {
  name: string;       // 종목명
  quantity: number;   // 수량
  costKrw: number;    // 매수금액
  valueKrw: number;   // 스냅샷 시점 평가금액
  pnlKrw: number;     // 손익금액
  returnPct: number;  // 수익률 (%)
}

/** 저축·부채 공용 스냅샷 행. */
export interface AssetSnapshotSimpleRow {
  name: string;
  amountKrw: number;
}

/** 손익 있는 자산군(주식·연금·코인)의 스냅샷 섹션. */
export interface AssetSnapshotPnlSection {
  totalValueKrw: number;
  totalCostKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  rows: AssetSnapshotRow[];
}

/** 금액만 있는 자산군(저축·부채)의 스냅샷 섹션. */
export interface AssetSnapshotAmountSection {
  totalKrw: number;
  rows: AssetSnapshotSimpleRow[];
}

/** 수동 전체 자산 스냅샷 1건 — 버튼 클릭 시점의 상태를 고정 저장(조회 시 재계산 없음). */
export interface AssetSnapshot {
  id: string;              // uuid (key)
  createdAt: number;       // epoch ms — 목록 정렬 기준
  netWorthKrw: number;     // 순자산 = totalAssetsKrw - totalDebtKrw
  totalAssetsKrw: number;  // 주식+저축+연금+코인 평가금 합
  totalDebtKrw: number;    // 부채 잔액 합
  stocks: AssetSnapshotPnlSection;
  pension: AssetSnapshotPnlSection;
  coin: AssetSnapshotPnlSection;
  savings: AssetSnapshotAmountSection;
  debt: AssetSnapshotAmountSection;
}
```

- [ ] **Step 4: 스키마 v7** — `lib/db/schema.ts`:
  - import 타입 목록에 `AssetSnapshot` 추가.
  - 클래스 필드: `debts!` 아래에 `assetSnapshots!: Table<AssetSnapshot, string>; // key: id (수동 전체 자산 스냅샷)`
  - 생성자 끝 v6 블록 뒤에:

```typescript
    // v7: 수동 전체 자산 스냅샷 테이블 추가 (docs/superpowers/specs/2026-07-02-asset-snapshot-design.md)
    this.version(7).stores({
      assetSnapshots: "id, createdAt",
    });
```

- [ ] **Step 5:** `npx vitest run test/db/schema.test.ts` → PASS.
- [ ] **Step 6:** `git add -A && git commit -m "feat: 자산 스냅샷 타입 + Dexie v7 assetSnapshots 테이블"`

### Task 2: 순수 빌더 buildAssetSnapshot

**Files:**
- Create: `lib/snapshot/asset-snapshot.ts`
- Test: `test/snapshot/asset-snapshot.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/snapshot/asset-snapshot.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildAssetSnapshot } from "@/lib/snapshot/asset-snapshot";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import { buildPensionVM } from "@/lib/pension/pension-service";
import { buildCoinVM } from "@/lib/coin/coin-service";
import { buildDebtVM } from "@/lib/debt/debt-service";
import type { Holding, PriceCache, SavingsAccount, PensionAccount, CoinHolding, LoanAccount } from "@/lib/types";

const holding: Holding = {
  id: "h1", connectionId: "c1", market: "KOSPI", symbol: "005930", name: "삼성전자",
  sector: "반도체", currency: "KRW", quantity: 10, avgBuyPrice: 70_000,
  source: "MANUAL", updatedAt: 1,
};
const price: PriceCache = { key: "005930|KRW", symbol: "005930", currency: "KRW", lastPrice: 80_000 };
const saving: SavingsAccount = {
  id: "s1", category: "DEPOSIT", name: "청년도약", amount: 1_000_000,
  sortOrder: 0, updatedAt: 1, source: "MANUAL",
};
const usdSaving: SavingsAccount = {
  id: "s2", category: "ETC", name: "달러예금", amount: 100, currency: "USD",
  sortOrder: 0, updatedAt: 1, source: "MANUAL",
};
const pensionAcc: PensionAccount = {
  id: "p1", category: "PERSONAL", name: "TIGER 미국S&P500", quantity: 5,
  buyPrice: 10_000, currentPrice: 12_000, sortOrder: 0, updatedAt: 1,
};
const coin: CoinHolding = {
  id: "cn1", name: "비트코인", quantity: 0.1, buyPrice: 100_000_000,
  currentPrice: 120_000_000, sortOrder: 0, updatedAt: 1, source: "MANUAL",
};
const loan: LoanAccount = {
  id: "d1", category: "CREDIT", name: "신용대출", balance: 5_000_000,
  sortOrder: 0, updatedAt: 1,
};

describe("buildAssetSnapshot", () => {
  it("VM 5종을 스냅샷으로 직렬화한다 (행 매핑·합계·순자산)", () => {
    const snap = buildAssetSnapshot({
      id: "snap1", createdAt: 1_000,
      portfolio: buildPortfolio({ holdings: [holding], prices: [price], sectorOverrides: {} }),
      savings: buildSavingsVM([saving, usdSaving], 1_400),
      pension: buildPensionVM([pensionAcc]),
      coin: buildCoinVM([coin]),
      debt: buildDebtVM([loan]),
    });
    expect(snap.id).toBe("snap1");
    expect(snap.createdAt).toBe(1_000);
    // 주식: 10주 × 80,000 = 800,000 / cost 700,000 / pnl 100,000
    expect(snap.stocks.rows).toEqual([{
      name: "삼성전자", quantity: 10, costKrw: 700_000, valueKrw: 800_000,
      pnlKrw: 100_000, returnPct: expect.closeTo(14.2857, 3),
    }]);
    // 저축: KRW 1,000,000 + USD 100×1,400 = 1,140,000
    expect(snap.savings.totalKrw).toBe(1_140_000);
    expect(snap.savings.rows).toEqual([
      { name: "청년도약", amountKrw: 1_000_000 },
      { name: "달러예금", amountKrw: 140_000 },
    ]);
    // 연금: 5 × 12,000 = 60,000 / 코인: 0.1 × 120,000,000 = 12,000,000
    expect(snap.pension.totalValueKrw).toBe(60_000);
    expect(snap.coin.rows[0]).toMatchObject({ name: "비트코인", valueKrw: 12_000_000, pnlKrw: 2_000_000 });
    // 부채
    expect(snap.debt).toEqual({ totalKrw: 5_000_000, rows: [{ name: "신용대출", amountKrw: 5_000_000 }] });
    // 합계: 800,000 + 1,140,000 + 60,000 + 12,000,000 = 14,000,000
    expect(snap.totalAssetsKrw).toBe(14_000_000);
    expect(snap.totalDebtKrw).toBe(5_000_000);
    expect(snap.netWorthKrw).toBe(9_000_000);
  });

  it("VM이 undefined면 빈 섹션으로 폴백한다", () => {
    const snap = buildAssetSnapshot({ id: "empty", createdAt: 1 });
    expect(snap.stocks).toEqual({ totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] });
    expect(snap.savings).toEqual({ totalKrw: 0, rows: [] });
    expect(snap.debt).toEqual({ totalKrw: 0, rows: [] });
    expect(snap.totalAssetsKrw).toBe(0);
    expect(snap.netWorthKrw).toBe(0);
  });

  it("부채가 없으면 순자산 = 자산 총액", () => {
    const snap = buildAssetSnapshot({
      id: "nodebt", createdAt: 1,
      savings: buildSavingsVM([saving]),
    });
    expect(snap.netWorthKrw).toBe(snap.totalAssetsKrw);
    expect(snap.totalAssetsKrw).toBe(1_000_000);
  });
});
```

- [ ] **Step 2:** `npx vitest run test/snapshot/asset-snapshot.test.ts` → FAIL (모듈 없음).
- [ ] **Step 3: 구현** — `lib/snapshot/asset-snapshot.ts`:

```typescript
import type {
  AssetSnapshot, AssetSnapshotPnlSection, AssetSnapshotAmountSection,
} from "@/lib/types";
import type { PortfolioVM } from "@/lib/portfolio/portfolio-service";
import type { SavingsVM } from "@/lib/savings/savings-service";
import type { PensionVM } from "@/lib/pension/pension-service";
import type { CoinVM } from "@/lib/coin/coin-service";
import type { DebtVM } from "@/lib/debt/debt-service";

/**
 * 자산 스냅샷 순수 빌더. DB·비동기·Date 없이 뷰모델 5종을 1건의 스냅샷으로 직렬화한다.
 * id·createdAt은 호출부에서 주입한다. VM이 없으면(미등록·로딩 실패) 빈 섹션으로 폴백.
 */

const emptyPnlSection = (): AssetSnapshotPnlSection => ({
  totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [],
});
const emptyAmountSection = (): AssetSnapshotAmountSection => ({ totalKrw: 0, rows: [] });

function stocksSection(vm?: PortfolioVM): AssetSnapshotPnlSection {
  if (vm == null) {
    return emptyPnlSection();
  }
  return {
    totalValueKrw: vm.totalValueKrw,
    totalCostKrw: vm.totalCostKrw,
    totalPnlKrw: vm.totalPnlKrw,
    returnPct: vm.returnPct,
    rows: vm.rows.map((r) => ({
      name: r.holding.name, quantity: r.holding.quantity,
      costKrw: r.costKrw, valueKrw: r.valueKrw, pnlKrw: r.pnlKrw, returnPct: r.returnPct,
    })),
  };
}

function pensionSection(vm?: PensionVM): AssetSnapshotPnlSection {
  if (vm == null) {
    return emptyPnlSection();
  }
  return {
    totalValueKrw: vm.totalValueKrw,
    totalCostKrw: vm.totalCostKrw,
    totalPnlKrw: vm.totalPnlKrw,
    returnPct: vm.returnPct,
    rows: vm.groups.flatMap((g) => g.accounts).map((a) => ({
      name: a.name, quantity: a.quantity,
      costKrw: a.costKrw, valueKrw: a.valueKrw, pnlKrw: a.pnlKrw, returnPct: a.returnPct,
    })),
  };
}

function coinSection(vm?: CoinVM): AssetSnapshotPnlSection {
  if (vm == null) {
    return emptyPnlSection();
  }
  return {
    totalValueKrw: vm.totalValueKrw,
    totalCostKrw: vm.totalCostKrw,
    totalPnlKrw: vm.totalPnlKrw,
    returnPct: vm.returnPct,
    rows: vm.holdings.map((h) => ({
      name: h.name, quantity: h.quantity,
      costKrw: h.costKrw, valueKrw: h.valueKrw, pnlKrw: h.pnlKrw, returnPct: h.returnPct,
    })),
  };
}

function savingsSection(vm?: SavingsVM): AssetSnapshotAmountSection {
  if (vm == null) {
    return emptyAmountSection();
  }
  return {
    totalKrw: vm.totalKrw,
    rows: vm.groups.flatMap((g) => g.accounts).map((a) => ({
      name: a.name, amountKrw: a.amountKrw,
    })),
  };
}

function debtSection(vm?: DebtVM): AssetSnapshotAmountSection {
  if (vm == null) {
    return emptyAmountSection();
  }
  return {
    totalKrw: vm.totalKrw,
    rows: vm.items.map((d) => ({ name: d.name, amountKrw: d.balance })),
  };
}

export function buildAssetSnapshot(input: {
  id: string;
  createdAt: number;
  portfolio?: PortfolioVM;
  savings?: SavingsVM;
  pension?: PensionVM;
  coin?: CoinVM;
  debt?: DebtVM;
}): AssetSnapshot {
  const stocks = stocksSection(input.portfolio);
  const savings = savingsSection(input.savings);
  const pension = pensionSection(input.pension);
  const coin = coinSection(input.coin);
  const debt = debtSection(input.debt);
  const totalAssetsKrw =
    stocks.totalValueKrw + savings.totalKrw + pension.totalValueKrw + coin.totalValueKrw;
  const totalDebtKrw = debt.totalKrw;
  return {
    id: input.id,
    createdAt: input.createdAt,
    netWorthKrw: totalAssetsKrw - totalDebtKrw,
    totalAssetsKrw,
    totalDebtKrw,
    stocks, pension, coin, savings, debt,
  };
}
```

- [ ] **Step 4:** `npx vitest run test/snapshot/asset-snapshot.test.ts` → PASS. (실패 시 저축 rows 순서는 `SavingsVM.groups` 순서(DEPOSIT→ETC)를 따름을 확인.)
- [ ] **Step 5:** `git add -A && git commit -m "feat: 자산 스냅샷 순수 빌더 buildAssetSnapshot"`

### Task 3: local-store CRUD

**Files:**
- Modify: `lib/db/local-store.ts` (파일 끝에 섹션 추가)
- Test: `test/db/local-store.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가** — `test/db/local-store.test.ts`에 (기존 import에 `addAssetSnapshot, listAssetSnapshots, getAssetSnapshot, deleteAssetSnapshot` 추가; 기존 파일의 afterEach/db 초기화 패턴을 그대로 따른다):

```typescript
import type { AssetSnapshot } from "@/lib/types";

const makeSnap = (id: string, createdAt: number): AssetSnapshot => ({
  id, createdAt, netWorthKrw: createdAt, totalAssetsKrw: createdAt, totalDebtKrw: 0,
  stocks: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  pension: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  coin: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
  savings: { totalKrw: 0, rows: [] },
  debt: { totalKrw: 0, rows: [] },
});

describe("asset snapshot CRUD", () => {
  it("추가하고 createdAt 내림차순으로 limit 조회한다", async () => {
    await addAssetSnapshot(makeSnap("a", 1));
    await addAssetSnapshot(makeSnap("b", 3));
    await addAssetSnapshot(makeSnap("c", 2));
    const top2 = await listAssetSnapshots(2);
    expect(top2.map((s) => s.id)).toEqual(["b", "c"]);
    const all = await listAssetSnapshots();
    expect(all.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("단건 조회·삭제", async () => {
    await addAssetSnapshot(makeSnap("a", 1));
    expect((await getAssetSnapshot("a"))?.id).toBe("a");
    await deleteAssetSnapshot("a");
    expect(await getAssetSnapshot("a")).toBeUndefined();
  });
});
```

- [ ] **Step 2:** `npx vitest run test/db/local-store.test.ts` → FAIL.
- [ ] **Step 3: 구현** — `lib/db/local-store.ts` 파일 끝에 (import에 `AssetSnapshot` 추가):

```typescript
// ── 자산 스냅샷 (수동 전체 기록) ─────────────────────────────────────────
export const addAssetSnapshot = (s: AssetSnapshot) => db.assetSnapshots.put(s);

/** createdAt 내림차순(최신 우선). limit 지정 시 상위 N개만. */
export function listAssetSnapshots(limit?: number): Promise<AssetSnapshot[]> {
  const q = db.assetSnapshots.orderBy("createdAt").reverse();
  if (limit != null) {
    return q.limit(limit).toArray();
  }
  return q.toArray();
}

export const getAssetSnapshot = (id: string) => db.assetSnapshots.get(id);
export const deleteAssetSnapshot = (id: string) => db.assetSnapshots.delete(id);
```

- [ ] **Step 4:** `npx vitest run test/db/local-store.test.ts` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: 자산 스냅샷 CRUD (local-store)"`

### Task 4: 캡처 서비스 captureAssetSnapshot

**Files:**
- Create: `lib/snapshot/capture.ts`
- Test: `test/snapshot/capture.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/snapshot/capture.test.ts` (fake-indexeddb는 `test/setup.ts`가 전역 제공, `test/db/schema.test.ts`의 afterEach 패턴 사용):

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { captureAssetSnapshot } from "@/lib/snapshot/capture";

afterEach(async () => { await db.delete(); await db.open(); });

describe("captureAssetSnapshot", () => {
  it("DB의 현재 상태로 스냅샷을 만들어 저장한다", async () => {
    await db.savings.put({
      id: "s1", category: "DEPOSIT", name: "청년도약", amount: 1_000_000,
      sortOrder: 0, updatedAt: 1, source: "MANUAL",
    });
    await db.debts.put({
      id: "d1", category: "CREDIT", name: "신용대출", balance: 300_000,
      sortOrder: 0, updatedAt: 1,
    });
    const snap = await captureAssetSnapshot({ id: "cap1", createdAt: 42 });
    expect(snap.netWorthKrw).toBe(700_000);
    const stored = await db.assetSnapshots.get("cap1");
    expect(stored?.createdAt).toBe(42);
    expect(stored?.savings.rows).toEqual([{ name: "청년도약", amountKrw: 1_000_000 }]);
    expect(stored?.debt.totalKrw).toBe(300_000);
  });

  it("빈 DB에서도 0원 스냅샷을 저장한다", async () => {
    const snap = await captureAssetSnapshot({ id: "cap0", createdAt: 1 });
    expect(snap.netWorthKrw).toBe(0);
    expect(await db.assetSnapshots.count()).toBe(1);
  });
});
```

- [ ] **Step 2:** `npx vitest run test/snapshot/capture.test.ts` → FAIL.
- [ ] **Step 3: 구현** — `lib/snapshot/capture.ts`:

```typescript
import {
  listHoldings, listPrices, getFx, getSectorOverrides,
  listSavings, listPension, listCoin, listDebts, addAssetSnapshot,
} from "@/lib/db/local-store";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import { buildSavingsVM } from "@/lib/savings/savings-service";
import { buildPensionVM } from "@/lib/pension/pension-service";
import { buildCoinVM } from "@/lib/coin/coin-service";
import { buildDebtVM } from "@/lib/debt/debt-service";
import { buildAssetSnapshot } from "@/lib/snapshot/asset-snapshot";
import type { AssetSnapshot } from "@/lib/types";

/**
 * 현재 DB 상태를 화면과 동일한 빌더(VM 5종)로 계산해 스냅샷 1건으로 저장한다.
 * id·createdAt은 호출부에서 주입한다(순수 빌더와의 경계 유지).
 */
export async function captureAssetSnapshot(meta: {
  id: string;
  createdAt: number;
}): Promise<AssetSnapshot> {
  const [holdings, prices, fx, sectorOverrides, savings, pension, coin, debts] =
    await Promise.all([
      listHoldings(), listPrices(), getFx(), getSectorOverrides(),
      listSavings(), listPension(), listCoin(), listDebts(),
    ]);
  const snapshot = buildAssetSnapshot({
    id: meta.id,
    createdAt: meta.createdAt,
    portfolio: buildPortfolio({
      holdings, prices,
      fx: fx ? { rate: fx.rate } : undefined,
      sectorOverrides,
    }),
    savings: buildSavingsVM(savings, fx?.rate),
    pension: buildPensionVM(pension),
    coin: buildCoinVM(coin),
    debt: buildDebtVM(debts),
  });
  await addAssetSnapshot(snapshot);
  return snapshot;
}
```

- [ ] **Step 4:** `npx vitest run test/snapshot/capture.test.ts` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: 자산 스냅샷 캡처 서비스 (DB 상태→VM 5종→저장)"`

### Task 5: 백업 포함 (v5)

**Files:**
- Modify: `lib/backup/backup.ts`
- Test: `test/backup/` 내 기존 backup 테스트 파일 (라운드트립·구버전 호환 테스트가 있는 파일에 추가)

- [ ] **Step 1: 실패하는 테스트 추가** — 기존 backup 테스트 파일의 패턴을 따라:

```typescript
it("assetSnapshots를 export/import 라운드트립한다", async () => {
  await db.assetSnapshots.put({
    id: "s1", createdAt: 10, netWorthKrw: 100, totalAssetsKrw: 100, totalDebtKrw: 0,
    stocks: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
    pension: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
    coin: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
    savings: { totalKrw: 100, rows: [{ name: "예금", amountKrw: 100 }] },
    debt: { totalKrw: 0, rows: [] },
  });
  const json = await exportAll();
  await db.delete(); await db.open();
  await importAll(json, { mode: "merge" });
  const got = await db.assetSnapshots.get("s1");
  expect(got?.savings.rows[0].name).toBe("예금");
});

it("overwrite 모드는 기존 assetSnapshots를 지우고 백업본으로 교체한다", async () => {
  await db.assetSnapshots.put({ /* id: "old", createdAt: 1, 빈 섹션들 — 위와 동일 형태 */ });
  const json = JSON.stringify({
    schemaVersion: 5, exportedAt: 1,
    data: { assetSnapshots: [/* id: "new", createdAt: 2, 빈 섹션들 */] },
  });
  await importAll(json, { mode: "overwrite" });
  expect(await db.assetSnapshots.get("old")).toBeUndefined();
  expect(await db.assetSnapshots.get("new")).toBeDefined();
});

it("assetSnapshots 없는 v4 백업도 불러온다", async () => {
  const json = JSON.stringify({ schemaVersion: 4, exportedAt: 1, data: {} });
  await expect(importAll(json, { mode: "merge" })).resolves.toBeUndefined();
});
```

- [ ] **Step 2:** 테스트 실행 → FAIL (schemaVersion 5 미지원 / assetSnapshots 미보존).
- [ ] **Step 3: 구현** — `lib/backup/backup.ts`:
  - 주석에 `// v5: 자산 스냅샷(assetSnapshots) 포함.` 추가, `SCHEMA_VERSION = 5`, `SUPPORTED_VERSIONS`에 5 추가.
  - `BackupData`에 `assetSnapshots: unknown[];` 추가.
  - `exportAll`의 `Promise.all`에 `db.assetSnapshots.toArray()` 추가, payload `data`에 `assetSnapshots` 추가.
  - `importAll`: `const assetSnapshots = (data.assetSnapshots ?? []) as Parameters<typeof db.assetSnapshots.bulkPut>[0];`
  - overwrite 블록에 `await db.assetSnapshots.clear();` (pension·debts와 동일 취급 — 스냅샷 로그는 백업본으로 완전 교체), 트랜잭션 끝에 `await db.assetSnapshots.bulkPut(assetSnapshots);`
- [ ] **Step 4:** `npx vitest run test/backup` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: 백업에 자산 스냅샷 포함 (payload v5)"`

### Task 6: 기존 일별 자동 스냅샷 제거

**Files:**
- Delete: `lib/snapshot/snapshot-service.ts`, `test/snapshot/snapshot-service.test.ts`
- Modify: `app/assets/stocks/page.tsx`

- [ ] **Step 1:** `app/assets/stocks/page.tsx`에서 제거:
  - `saveDailySnapshotIfNeeded` import (15행 부근), 관련 `getSettings`/`todayStr` import 중 다른 곳에서 안 쓰면 함께.
  - "진입 시 일별 스냅샷" `useEffect` 블록 전체(95~112행 부근)와 `snapshotDone` ref, 사용처 없어진 `PortfolioVM` 타입 import.
- [ ] **Step 2:** `git rm lib/snapshot/snapshot-service.ts test/snapshot/snapshot-service.test.ts`
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test` → 전부 PASS (미사용 import 잔류 시 lint가 잡는다).
- [ ] **Step 4:** `git add -A && git commit -m "feat: 주식 일별 자동 스냅샷 제거 (수동 전체 스냅샷으로 일원화)"`

### Task 7: formatDateTime + 추이 헬퍼 buildTrendData

**Files:**
- Modify: `lib/format.ts`
- Create: `lib/snapshot/trend.ts`
- Test: `test/format.test.ts`, `test/snapshot/trend.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `test/format.test.ts`에 추가:

```typescript
it("formatDateTime: epoch ms → YYYY.MM.DD HH:mm", () => {
  // 로컬 타임존 기준 — 고정 시각으로 구성
  const d = new Date(2026, 6, 2, 14, 5); // 2026-07-02 14:05
  expect(formatDateTime(d.getTime())).toBe("2026.07.02 14:05");
});
```

`test/snapshot/trend.test.ts` 생성:

```typescript
import { describe, it, expect } from "vitest";
import { buildTrendData } from "@/lib/snapshot/trend";

const snap = (id: string, createdAt: number, netWorthKrw: number) => ({ id, createdAt, netWorthKrw });

describe("buildTrendData", () => {
  it("내림차순 입력을 시간순으로 뒤집고 직전 대비 변화량을 계산한다", () => {
    const out = buildTrendData([snap("c", 3, 130), snap("b", 2, 100), snap("a", 1, 120)]);
    expect(out.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(out.map((d) => d.deltaKrw)).toEqual([null, -20, 30]); // 첫 기록은 직전 없음
  });

  it("display개 초과면 최신 display개만 표시하되, 잘린 직전 값으로 가장 오래된 막대도 계산한다", () => {
    // 25개(최신 createdAt=25). display=20 → 표시 6..25, 6의 delta는 5 기준으로 계산됨
    const desc = Array.from({ length: 25 }, (_, i) => snap(`s${25 - i}`, 25 - i, (25 - i) * 10));
    const out = buildTrendData(desc, 20);
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe("s6");
    expect(out[0].deltaKrw).toBe(10); // 60 - 50
  });

  it("변화량 0은 0으로 유지한다(막대 생략은 렌더 판단)", () => {
    const out = buildTrendData([snap("b", 2, 100), snap("a", 1, 100)]);
    expect(out[1].deltaKrw).toBe(0);
  });
});
```

- [ ] **Step 2:** 두 테스트 실행 → FAIL.
- [ ] **Step 3: 구현** — `lib/format.ts` 끝에:

```typescript
/** epoch ms → "YYYY.MM.DD HH:mm" (스냅샷 시점 등 로컬 시각 표기). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

`lib/snapshot/trend.ts`:

```typescript
/**
 * 순자산 추이 콤보 차트용 순수 헬퍼. DB·Date 없음.
 * 입력은 createdAt 내림차순(최신 우선) 목록 — listAssetSnapshots 반환 순서 그대로.
 */

export interface TrendSource {
  id: string;
  createdAt: number;
  netWorthKrw: number;
}

export interface TrendDatum extends TrendSource {
  /** 직전 스냅샷 대비 변화량. 직전이 없으면(전체 첫 기록) null. */
  deltaKrw: number | null;
}

/**
 * 최신 display개를 시간순(과거→최신)으로 반환한다.
 * 입력에 display+1개째(표시 구간 직전 값)가 있으면 가장 오래된 표시 항목의 변화량도 계산한다.
 */
export function buildTrendData(snapshotsDesc: TrendSource[], display = 20): TrendDatum[] {
  const asc = snapshotsDesc.slice(0, display + 1).reverse();
  const start = Math.max(0, asc.length - display);
  const out: TrendDatum[] = [];
  for (let i = start; i < asc.length; i += 1) {
    const prev = i > 0 ? asc[i - 1] : undefined;
    out.push({
      ...asc[i],
      deltaKrw: prev == null ? null : asc[i].netWorthKrw - prev.netWorthKrw,
    });
  }
  return out;
}
```

- [ ] **Step 4:** `npx vitest run test/format.test.ts test/snapshot/trend.test.ts` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: 스냅샷 추이 데이터 헬퍼 + formatDateTime"`

### Task 8: 쿼리 훅 use-asset-snapshots

**Files:**
- Create: `lib/query/use-asset-snapshots.ts`

- [ ] **Step 1: 구현** (얇은 글루 — 로직은 Task 3·4에서 테스트됨. 기존 훅 패턴 `use-savings.ts` 준수):

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import {
  listAssetSnapshots, getAssetSnapshot, deleteAssetSnapshot,
} from "@/lib/db/local-store";
import { captureAssetSnapshot } from "@/lib/snapshot/capture";

const SNAPSHOT_KEY = ["assetSnapshots"] as const;

/** 스냅샷 목록(최신 우선). limit 미지정 시 전체. 잠금 상태에서는 비활성. */
export function useAssetSnapshots(limit?: number) {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: [...SNAPSHOT_KEY, limit ?? "all"],
    enabled: !locked,
    staleTime: 30_000,
    queryFn: () => listAssetSnapshots(limit),
  });
}

/** 스냅샷 단건. 잠금 상태에서는 비활성. */
export function useAssetSnapshot(id: string) {
  const locked = useAppStore((s) => s.locked);
  return useQuery({
    queryKey: [...SNAPSHOT_KEY, "detail", id],
    enabled: !locked,
    queryFn: () => getAssetSnapshot(id),
  });
}

/** 스냅샷 기록·삭제 뮤테이션. 성공 시 스냅샷 쿼리 전체 무효화. */
export function useSnapshotMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });

  const take = useMutation({
    mutationFn: () =>
      captureAssetSnapshot({ id: crypto.randomUUID(), createdAt: Date.now() }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAssetSnapshot(id),
    onSuccess: invalidate,
  });

  return { take, remove };
}
```

- [ ] **Step 2:** `npm run typecheck && npm run lint` → PASS.
- [ ] **Step 3:** `git add -A && git commit -m "feat: 자산 스냅샷 쿼리 훅"`

### Task 9: SnapshotTrendChart (콤보 차트)

@frontend-design:frontend-design 스킬과 DESIGN.md를 먼저 읽는다.

**Files:**
- Create: `components/snapshot/SnapshotTrendChart.tsx`
- Test: `test/snapshot/trend-chart.test.tsx` (렌더 스모크)

**차트 규격 (스펙 §7):** viewBox `0 0 320 150`. 세로 두 밴드 — 상단 밴드 y 8~96(선), 하단 밴드 y 104~150(막대, 기준선 y=127). 겹침 없음, x 좌표 공유. 선 색 `#A87342`(primary), 막대 증가 `#F04452`(up)·감소 `#3182F6`(down). 포인트 마커 r=3. 데이터 2개 미만이면 `null` 반환(숨김).

- [ ] **Step 1: 실패하는 렌더 테스트** — `test/snapshot/trend-chart.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SnapshotTrendChart } from "@/components/snapshot/SnapshotTrendChart";

const snap = (id: string, createdAt: number, netWorthKrw: number) => ({ id, createdAt, netWorthKrw });

describe("SnapshotTrendChart", () => {
  it("스냅샷 2개 미만이면 렌더하지 않는다", () => {
    const { container } = render(<SnapshotTrendChart snapshotsDesc={[snap("a", 1, 100)]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("선(polyline)과 변화량 막대(rect)를 그린다 — 첫 기록·변화량 0은 막대 없음", () => {
    const { container } = render(
      <SnapshotTrendChart
        snapshotsDesc={[snap("c", 3, 130), snap("b", 2, 100), snap("a", 1, 100)]}
      />,
    );
    expect(container.querySelector("polyline")).not.toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(3); // 포인트 마커
    // a: 첫 기록(null), b: delta 0 → 막대 없음. c: +30 → 막대 1개(up 색)
    const bars = container.querySelectorAll("rect[data-trend-bar]");
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute("fill")).toBe("#F04452");
  });
});
```

- [ ] **Step 2:** 실행 → FAIL.
- [ ] **Step 3: 구현** — `components/snapshot/SnapshotTrendChart.tsx`:

```tsx
import { buildTrendData, type TrendSource } from "@/lib/snapshot/trend";

interface SnapshotTrendChartProps {
  /** createdAt 내림차순(최신 우선) — listAssetSnapshots 반환 순서 그대로. */
  snapshotsDesc: TrendSource[];
  /** 표시 개수. 기본 20. */
  display?: number;
}

// viewBox 좌표계 (반응형은 svg width=100%로 처리)
const W = 320;
const H = 150;
const PAD_X = 10;
const LINE_TOP = 8;
const LINE_BOTTOM = 96;
const BAR_BASELINE = 127; // 하단 밴드(104~150) 중앙
const BAR_HALF = 23;      // 기준선에서 위/아래 최대 높이
const BAR_WIDTH_RATIO = 0.5; // 슬롯 폭 대비 막대 폭

// DESIGN.md 토큰: primary(브랜드) / up(수익·증가=빨강) / down(손실·감소=파랑)
const LINE_COLOR = "#A87342";
const UP_COLOR = "#F04452";
const DOWN_COLOR = "#3182F6";
const BASELINE_COLOR = "#F1ECE4"; // hairline

/**
 * 순자산 추이 콤보 차트. 상단 밴드=순자산 선(포인트 마커), 하단 밴드=직전 대비 변화량 막대.
 * 두 밴드는 겹치지 않고 x 좌표만 공유한다. 축 라벨 없는 상대 스케일(스펙 §7).
 */
export function SnapshotTrendChart({ snapshotsDesc, display = 20 }: SnapshotTrendChartProps) {
  const data = buildTrendData(snapshotsDesc, display);
  if (data.length < 2) {
    return null;
  }

  const xAt = (i: number) => {
    if (data.length === 1) {
      return W / 2;
    }
    return PAD_X + (i * (W - PAD_X * 2)) / (data.length - 1);
  };
  const slotWidth = (W - PAD_X * 2) / (data.length - 1);
  const barWidth = Math.min(12, slotWidth * BAR_WIDTH_RATIO);

  // 선: min~max 상대 스케일. 전 구간 동일 값이면 밴드 세로 중앙 수평선.
  const values = data.map((d) => d.netWorthKrw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yAt = (v: number) => {
    if (max === min) {
      return (LINE_TOP + LINE_BOTTOM) / 2;
    }
    return LINE_BOTTOM - ((v - min) / (max - min)) * (LINE_BOTTOM - LINE_TOP);
  };
  const points = data.map((d, i) => `${xAt(i)},${yAt(d.netWorthKrw)}`).join(" ");

  // 막대: 변화량 절대값 최대 기준 독립 스케일. null(첫 기록)·0은 그리지 않는다.
  const maxAbsDelta = Math.max(...data.map((d) => Math.abs(d.deltaKrw ?? 0)));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="순자산 추이와 직전 대비 변화량"
    >
      {/* 하단 밴드 0 기준선 */}
      <line x1={PAD_X} y1={BAR_BASELINE} x2={W - PAD_X} y2={BAR_BASELINE} stroke={BASELINE_COLOR} strokeWidth={1} />
      {data.map((d, i) => {
        if (d.deltaKrw == null || d.deltaKrw === 0 || maxAbsDelta === 0) {
          return null;
        }
        const h = (Math.abs(d.deltaKrw) / maxAbsDelta) * BAR_HALF;
        const up = d.deltaKrw > 0;
        return (
          <rect
            key={d.id}
            data-trend-bar
            x={xAt(i) - barWidth / 2}
            y={up ? BAR_BASELINE - h : BAR_BASELINE}
            width={barWidth}
            height={h}
            rx={1.5}
            fill={up ? UP_COLOR : DOWN_COLOR}
          />
        );
      })}
      {/* 상단 밴드: 순자산 선 + 포인트 */}
      <polyline points={points} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={d.id} cx={xAt(i)} cy={yAt(d.netWorthKrw)} r={3} fill={LINE_COLOR} />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4:** `npx vitest run test/snapshot/trend-chart.test.tsx` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: 순자산 추이 콤보 차트 (선+변화량 막대)"`

### Task 10: SnapshotSection + 자산 탭 통합

@frontend-design:frontend-design 스킬 준수. DESIGN.md 토큰 사용.

**Files:**
- Create: `components/snapshot/SnapshotListItem.tsx`, `components/snapshot/SnapshotSection.tsx`
- Modify: `app/assets/page.tsx`

- [ ] **Step 1: 목록 행 컴포넌트** — `components/snapshot/SnapshotListItem.tsx` (섹션·전체 목록 공용):

```tsx
import Link from "next/link";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { formatKrw, formatDateTime } from "@/lib/format";
import type { AssetSnapshot } from "@/lib/types";

/** 스냅샷 목록 행: 시점 + 순자산. 클릭 시 상세로 이동. */
export function SnapshotListItem({ snapshot }: { snapshot: AssetSnapshot }) {
  return (
    <Link
      href={`/assets/snapshots/${snapshot.id}`}
      className="flex items-center gap-4 rounded-[20px] bg-surface-card p-5 shadow-card transition-colors hover:bg-surface-soft active:bg-surface-strong"
    >
      <span className="flex-1 text-[13px] font-normal leading-[1.4] text-muted tabular-nums">
        {formatDateTime(snapshot.createdAt)}
      </span>
      <PrivacyAmount revealLabel="스냅샷 순자산 보기">
        <span className="text-[15px] font-bold leading-[1.3] tabular-nums text-ink">
          {formatKrw(snapshot.netWorthKrw)}
        </span>
      </PrivacyAmount>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-muted-soft">
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
```

- [ ] **Step 2: 섹션 컴포넌트** — `components/snapshot/SnapshotSection.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SnapshotTrendChart } from "@/components/snapshot/SnapshotTrendChart";
import { SnapshotListItem } from "@/components/snapshot/SnapshotListItem";
import { useAssetSnapshots, useSnapshotMutations } from "@/lib/query/use-asset-snapshots";

const CHART_COUNT = 20;
const LIST_COUNT = 10;

/**
 * 자산 탭 하단 스냅샷 섹션: 기록 버튼 + 추이 콤보 차트(최신 20) + 최근 10개 목록 + 더보기.
 * 차트 20개 + 변화량 계산용 직전 1개 = 21개를 한 번에 조회하고 목록은 앞 10개만 쓴다.
 */
export function SnapshotSection({ takeDisabled }: { takeDisabled: boolean }) {
  const { data: snapshots, isLoading } = useAssetSnapshots(CHART_COUNT + 1);
  const { take } = useSnapshotMutations();

  // 로딩 중 빈 상태 깜빡임 방지 (DebtSection과 동일 패턴)
  if (isLoading) {
    return null;
  }

  const items = snapshots ?? [];
  const listItems = items.slice(0, LIST_COUNT);
  const hasMore = items.length > LIST_COUNT;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold text-ink">스냅샷</h2>
        <button
          onClick={() => take.mutate()}
          disabled={takeDisabled || take.isPending}
          className="text-[13px] font-medium text-muted active:text-ink disabled:opacity-40"
        >
          {take.isPending ? "기록 중…" : "+ 지금 기록"}
        </button>
      </div>

      {items.length >= 2 && (
        <Card className="px-4 py-4">
          <SnapshotTrendChart snapshotsDesc={items} display={CHART_COUNT} />
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="py-6 text-center text-[13px] text-muted">
          아직 기록한 스냅샷이 없어요
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {listItems.map((s) => (
            <li key={s.id}>
              <SnapshotListItem snapshot={s} />
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <Link
          href="/assets/snapshots"
          className="py-2 text-center text-[13px] font-medium text-muted active:text-ink"
        >
          더보기
        </Link>
      )}
    </section>
  );
}
```

- [ ] **Step 3: 자산 탭에 삽입** — `app/assets/page.tsx`:
  - import 추가: `import { SnapshotSection } from "@/components/snapshot/SnapshotSection";`
  - `<DebtSection />` 아래에:

```tsx
        <SnapshotSection
          takeDisabled={
            portfolio.isLoading || savings.isLoading || pension.isLoading ||
            coin.isLoading || debt.isLoading
          }
        />
```

- [ ] **Step 4:** `npm run typecheck && npm run lint && npm test` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: 자산 탭 스냅샷 섹션 (기록 버튼·차트·최근 목록)"`

### Task 11: 전체 목록 화면

**Files:**
- Create: `app/assets/snapshots/page.tsx`

- [ ] **Step 1: 구현** (뒤로가기 헤더는 기존 서브 화면 패턴 — `app/assets/savings/page.tsx` 상단 헤더 참고해 동일 스타일 사용):

```tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SnapshotListItem } from "@/components/snapshot/SnapshotListItem";
import { useAssetSnapshots } from "@/lib/query/use-asset-snapshots";

/** 스냅샷 전체 목록 — 자산 탭 "더보기"에서 진입. */
export default function SnapshotListPage() {
  const { data: snapshots, isLoading } = useAssetSnapshots();
  const items = snapshots ?? [];

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4">
        <header className="flex items-center gap-2">
          <Link href="/assets" aria-label="자산으로 돌아가기" className="p-1 -ml-1 text-muted active:text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-[19px] font-bold text-ink">스냅샷</h1>
        </header>

        {isLoading ? null : items.length === 0 ? (
          <Card className="py-10 text-center text-[15px] text-muted">
            아직 기록한 스냅샷이 없어요
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((s) => (
              <li key={s.id}>
                <SnapshotListItem snapshot={s} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
```

주의: 구현 전에 `app/assets/savings/page.tsx`의 실제 헤더 마크업을 확인하고 그 패턴을 따른다(위 코드는 기본형).

- [ ] **Step 2:** `npm run typecheck && npm run lint` → PASS.
- [ ] **Step 3:** `git add -A && git commit -m "feat: 스냅샷 전체 목록 화면"`

### Task 12: 상세 화면 + 삭제

**Files:**
- Create: `app/assets/snapshots/[id]/page.tsx`

**구성 (스펙 §7):** 요약 카드(시점·순자산·자산/부채 총액) → 주식/연금/코인 표(종목명·수량·매수금액·평가금액·손익·수익률, 값 있는 자산군만) → 저축/부채 표(항목명·금액) → 삭제 버튼. Next 16 `use(params)`. 삭제 확인은 기존 `Dialog`(`components/ui/Dialog.tsx`) 프리미티브 사용 — 구현 전 해당 컴포넌트 props를 확인하고, 안 맞으면 `app/holdings/[id]/page.tsx`의 삭제 확인 패턴을 따른다.

- [ ] **Step 1: 구현** — `app/assets/snapshots/[id]/page.tsx`:

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { PnlText } from "@/components/ui/PnlText";
import { Dialog } from "@/components/ui/Dialog";
import { useAssetSnapshot, useSnapshotMutations } from "@/lib/query/use-asset-snapshots";
import { formatKrw, formatDateTime } from "@/lib/format";
import type { AssetSnapshotPnlSection, AssetSnapshotAmountSection } from "@/lib/types";

/** 손익 자산군(주식·연금·코인) 표 섹션. 값이 없으면 렌더하지 않는다. */
function PnlTable({ title, section }: { title: string; section: AssetSnapshotPnlSection }) {
  if (section.rows.length === 0) {
    return null;
  }
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <PnlText amountKrw={section.totalPnlKrw} returnPct={section.returnPct} className="text-[13px] font-semibold" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[12px] tabular-nums">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-2 font-normal">종목명</th>
              <th className="py-1 pr-2 font-normal text-right">수량</th>
              <th className="py-1 pr-2 font-normal text-right">매수금액</th>
              <th className="py-1 pr-2 font-normal text-right">평가금액</th>
              <th className="py-1 font-normal text-right">손익</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r) => (
              <tr key={r.name} className="border-t border-hairline">
                <td className="py-2 pr-2 font-medium text-ink">{r.name}</td>
                <td className="py-2 pr-2 text-right text-body">{r.quantity.toLocaleString("ko-KR")}</td>
                <td className="py-2 pr-2 text-right text-body">{formatKrw(r.costKrw)}</td>
                <td className="py-2 pr-2 text-right text-body">{formatKrw(r.valueKrw)}</td>
                <td className="py-2 text-right">
                  <PnlText amountKrw={r.pnlKrw} returnPct={r.returnPct} className="text-[12px]" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** 금액 자산군(저축·부채) 표 섹션. */
function AmountTable({ title, section }: { title: string; section: AssetSnapshotAmountSection }) {
  if (section.rows.length === 0) {
    return null;
  }
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <span className="text-[13px] font-semibold tabular-nums text-ink">{formatKrw(section.totalKrw)}</span>
      </div>
      <ul className="flex flex-col">
        {section.rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between border-t border-hairline py-2 text-[13px]">
            <span className="text-body">{r.name}</span>
            <span className="tabular-nums text-ink">{formatKrw(r.amountKrw)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function SnapshotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: snapshot, isLoading } = useAssetSnapshot(id);
  const { remove } = useSnapshotMutations();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return null;
  }
  if (snapshot == null) {
    return (
      <main className="min-h-screen bg-canvas">
        <div className="mx-auto w-full max-w-[480px] px-4 pt-16 flex flex-col items-center gap-4">
          <p className="text-[15px] text-muted">스냅샷을 찾을 수 없어요</p>
          <Link href="/assets/snapshots" className="text-[14px] font-medium text-primary">목록으로 가기</Link>
        </div>
      </main>
    );
  }

  async function handleDelete() {
    await remove.mutateAsync(id);
    router.replace("/assets/snapshots");
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto w-full max-w-[480px] px-4 pt-6 pb-28 flex flex-col gap-4">
        <header className="flex items-center gap-2">
          <Link href="/assets/snapshots" aria-label="스냅샷 목록으로" className="p-1 -ml-1 text-muted active:text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-[19px] font-bold text-ink">스냅샷 상세</h1>
        </header>

        <Card variant="hero" className="flex flex-col gap-2">
          <span className="text-[13px] text-muted tabular-nums">{formatDateTime(snapshot.createdAt)}</span>
          <PrivacyAmount revealLabel="스냅샷 순자산 보기">
            <span className="text-[28px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
              {formatKrw(snapshot.netWorthKrw)}
            </span>
          </PrivacyAmount>
          <span className="text-[13px] text-muted">
            자산 {formatKrw(snapshot.totalAssetsKrw)} · 부채 {formatKrw(snapshot.totalDebtKrw)}
          </span>
        </Card>

        <PnlTable title="주식" section={snapshot.stocks} />
        <PnlTable title="연금" section={snapshot.pension} />
        <PnlTable title="코인" section={snapshot.coin} />
        <AmountTable title="저축/현금성" section={snapshot.savings} />
        <AmountTable title="부채" section={snapshot.debt} />

        <button
          onClick={() => setConfirmOpen(true)}
          className="py-3 text-center text-[14px] font-medium text-down active:opacity-70"
        >
          이 스냅샷 삭제
        </button>

        <Dialog
          open={confirmOpen}
          title="스냅샷을 삭제할까요?"
          onClose={() => setConfirmOpen(false)}
        >
          {/* Dialog 프리미티브의 실제 API에 맞춰 확인/취소 버튼 구성 — 구현 전 props 확인 */}
          <div className="flex gap-2">
            <button onClick={() => setConfirmOpen(false)} className="flex-1 rounded-[14px] bg-surface-soft py-3 text-[14px] font-medium text-body">
              취소
            </button>
            <button onClick={handleDelete} className="flex-1 rounded-[14px] bg-down py-3 text-[14px] font-semibold text-white">
              삭제
            </button>
          </div>
        </Dialog>
      </div>
    </main>
  );
}
```

주의: `Dialog`·`Card`의 실제 props(variant 등)와 hairline 보더 클래스명을 구현 전에 확인하고 맞춘다. 표의 이름 중복 가능성이 있으면 `key`를 `${r.name}-${i}`로.

- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test` → PASS.
- [ ] **Step 3:** `git add -A && git commit -m "feat: 스냅샷 상세 화면 (자산군별 표 + 삭제)"`

### Task 13: 문서 동기화

**Files:**
- Modify: `docs/architecture.md` — 데이터 흐름·라우트에 스냅샷 반영, 기존 일별 자동 스냅샷 서술을 수동 전체 스냅샷으로 교체.
- Modify: `docs/backup.md` — `assetSnapshots` 테이블·payload v5 반영.
- Modify: `AGENTS.md` — 디렉토리 요약에 `assets/snapshots`(목록·상세)·`components/snapshot/` 추가, `lib/` 요약의 `snapshot/` 설명 갱신.
- Modify: `DESIGN.md` — 컴포넌트 규격에 스냅샷 추이 콤보 차트(밴드 구성·색 시맨틱) 추가.

- [ ] **Step 1:** 각 문서를 실제 최종 코드와 대조해 갱신(스펙 §9 참고).
- [ ] **Step 2:** `git add -A && git commit -m "docs: 자산 스냅샷 기능 문서 동기화"`

### Task 14: 최종 검증 + PR

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test` → 전부 PASS.
- [ ] **Step 2:** superpowers:verification-before-completion 준수 — `npm run dev`로 수동 검증:
  - 자산 탭에서 "지금 기록" → 목록에 행 추가 확인.
  - 2회 이상 기록 후 차트 표시(선+막대, 증가 빨강/감소 파랑) 확인.
  - 행 클릭 → 상세 표(주식·연금·코인 6열, 저축·부채 2열) 확인.
  - 삭제 → 목록 복귀·행 제거 확인.
  - 11개 이상 기록 시 "더보기" → 전체 목록 확인.
  - 존재하지 않는 id 접근(`/assets/snapshots/nope`) → 안내 문구.
- [ ] **Step 3:** superpowers:requesting-code-review로 코드 리뷰 후 이슈 수정.
- [ ] **Step 4:** **사용자 확인 후** branch push → `gh pr create` (dtr-deploy 스킬 준수, PR 본문 끝 서명 포함). Vercel 프리뷰 URL 공유.
