# 대출(부채) 관리 + 순자산 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대출(부채)을 입력·관리하고 `순자산 = 총자산 − 부채총액`을 자산 요약 화면에 노출한다.

**Architecture:** 저축·연금·코인과 동일한 로컬 퍼스트 패턴으로 신규 `debts` Dexie 테이블 + 순수 계산 서비스 + 쿼리 훅을 미러링한다. CRUD는 `lib/db/local-store.ts` 헬퍼 경유. UI는 `/assets` 요약 페이지에 '부채' 섹션과 모달 폼을 추가하고, 히어로를 순자산으로 바꾼다. 별도 서브탭/라우트·스냅샷 변경·API 연동은 없다.

**Tech Stack:** Next.js 16 (App Router, `"use client"`) · React 19 · TypeScript · Dexie 4 · @tanstack/react-query 5 · Tailwind v4 · vitest 4 + fake-indexeddb.

**참고 스펙:** `docs/superpowers/specs/2026-07-01-debt-net-worth-design.md`

> 📌 두 개의 독립된 버전 카운터가 등장한다. 혼동하지 말 것: **Dexie 스키마 버전 = v6**(Task 1), **백업 포맷 버전 `SCHEMA_VERSION` = 2→3**(Task 4).

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `lib/types.ts` | `LoanCategory`·`LoanAccount` 타입 | 추가 |
| `lib/db/schema.ts` | Dexie 스키마 v6 + `debts` 스토어 | 수정 |
| `lib/db/local-store.ts` | `listDebts`/`upsertDebt`/`deleteDebt` 헬퍼 | 추가 |
| `lib/debt/debt-service.ts` | `buildDebtVM` 순수 계산 + 카테고리 메타 | 생성 |
| `lib/backup/backup.ts` | 백업에 `debts` 포함, `SCHEMA_VERSION` 2→3 | 수정 |
| `lib/query/use-debt.ts` | `useDebt` 조회 + CRUD 뮤테이션 | 생성 |
| `components/debt/DebtAccountDialog.tsx` | 대출 추가/수정 모달 폼 | 생성 |
| `components/debt/DebtSection.tsx` | 요약 페이지 부채 섹션(목록+추가 버튼) | 생성 |
| `app/assets/page.tsx` | 순자산 계산·히어로·부채 섹션 배치 | 수정 |
| `test/debt/debt-service.test.ts` | 순수 계산 테스트 | 생성 |
| `test/backup/backup.test.ts` | 백업 왕복에 debts 포함(기존 파일이면 확장) | 생성/수정 |

---

## Task 1: 타입 + DB 스키마

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: `LoanCategory`·`LoanAccount` 타입 추가**

`lib/types.ts`의 `CoinHolding` 인터페이스 바로 뒤(라인 116 이후, `Settings` 앞)에 추가:

```typescript
export type LoanCategory = "MORTGAGE" | "CREDIT" | "JEONSE" | "CAR" | "STUDENT" | "ETC";
// 주택담보 / 신용 / 전세자금 / 자동차 / 학자금 / 기타

/** 대출(부채, 수동). 잔액은 KRW 고정·양수로 저장. 순자산 = 자산총액 − Σ balance. */
export interface LoanAccount {
  id: string;
  category: LoanCategory;
  name: string;            // 대출명 — 예: "주택담보대출"
  lender?: string;         // 금융기관 — 예: "국민은행"
  balance: number;         // 현재 잔액 (KRW, 양수)
  interestRate?: number;   // 연 금리 (%)
  monthlyPayment?: number; // 월 상환액 (KRW)
  maturityDate?: string;   // 만기 "YYYY-MM-DD"
  note?: string;           // 비고
  sortOrder: number;       // 표시 순서
  updatedAt: number;
}
```

- [ ] **Step 2: Dexie 스키마에 `debts` 테이블 추가**

`lib/db/schema.ts`:
- 상단 타입 import에 `LoanAccount` 추가 (라인 2-5의 import 블록).
- 클래스 필드 선언(라인 30 `coin!` 뒤)에 추가:

```typescript
  debts!: Table<LoanAccount, string>;         // key: id (수동 대출/부채)
```

- constructor 마지막(라인 62 v5 블록 뒤)에 v6 추가:

```typescript
    // v6: 수동 대출/부채 테이블 추가
    this.version(6).stores({
      debts: "id, category, sortOrder",
    });
```

- [ ] **Step 3: 타입체크로 검증**

Run: `npm run typecheck`
Expected: PASS (에러 없음)

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/db/schema.ts
git commit -m "feat(debt): LoanAccount 타입 + debts 테이블(v6) 추가"
```

---

## Task 2: local-store CRUD 헬퍼

**Files:**
- Modify: `lib/db/local-store.ts`

기존 `listSavings`/`upsertSavings`/`deleteSavings`(라인 79-108)와 동일 패턴. `uid`/`now`는 이미 이 파일에서 사용 중이다.

- [ ] **Step 1: 타입 import에 `LoanAccount`, `LoanCategory` 추가**

`lib/db/local-store.ts` 라인 3 import 목록에 `LoanAccount, LoanCategory` 추가.

- [ ] **Step 2: 대출 헬퍼 추가**

`deleteSavings` 관련 블록 뒤(코인/연금 헬퍼들과 같은 구역)에 추가:

```typescript
// ── 대출/부채 (수동) ─────────────────────────────────────────────────────
export const listDebts = () => db.debts.toArray();

async function nextDebtSortOrder(): Promise<number> {
  const rows = await db.debts.toArray();
  const max = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  return max + 1;
}

export async function upsertDebt(
  d: Partial<LoanAccount> & { id?: string },
): Promise<LoanAccount> {
  const existing = d.id ? await db.debts.get(d.id) : undefined;
  const sortOrder = d.sortOrder ?? existing?.sortOrder ?? (await nextDebtSortOrder());
  const rec = {
    ...existing,
    ...d,
    id: d.id ?? uid(),
    category: (d.category ?? existing?.category ?? "ETC") as LoanCategory,
    sortOrder,
    updatedAt: now(),
  } as LoanAccount;
  await db.debts.put(rec);
  return rec;
}

export const deleteDebt = (id: string) => db.debts.delete(id);
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/db/local-store.ts
git commit -m "feat(debt): local-store CRUD 헬퍼(listDebts/upsertDebt/deleteDebt)"
```

---

## Task 3: 순수 계산 서비스 (TDD)

**Files:**
- Create: `lib/debt/debt-service.ts`
- Test: `test/debt/debt-service.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/debt/debt-service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildDebtVM, debtCategoryLabel } from "@/lib/debt/debt-service";
import type { LoanAccount } from "@/lib/types";

function loan(over: Partial<LoanAccount>): LoanAccount {
  return {
    id: "1", category: "ETC", name: "대출", balance: 0,
    sortOrder: 0, updatedAt: 0, ...over,
  };
}

describe("buildDebtVM", () => {
  it("빈 목록이면 총액 0", () => {
    const vm = buildDebtVM([]);
    expect(vm.totalKrw).toBe(0);
    expect(vm.items).toEqual([]);
  });

  it("잔액을 합산한다", () => {
    const vm = buildDebtVM([
      loan({ id: "a", balance: 120_000_000 }),
      loan({ id: "b", balance: 5_000_000 }),
    ]);
    expect(vm.totalKrw).toBe(125_000_000);
    expect(vm.items).toHaveLength(2);
  });

  it("sortOrder 오름차순으로 정렬한다", () => {
    const vm = buildDebtVM([
      loan({ id: "a", sortOrder: 2 }),
      loan({ id: "b", sortOrder: 0 }),
      loan({ id: "c", sortOrder: 1 }),
    ]);
    expect(vm.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("카테고리 한글 라벨을 반환한다", () => {
    expect(debtCategoryLabel("MORTGAGE")).toBe("주택담보");
    expect(debtCategoryLabel("JEONSE")).toBe("전세자금");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- debt-service`
Expected: FAIL (`buildDebtVM` 모듈 없음)

- [ ] **Step 3: 최소 구현**

`lib/debt/debt-service.ts`:

```typescript
import type { LoanAccount, LoanCategory } from "@/lib/types";

/** 대출/부채 순수 계산. DB·비동기·Date 없이 입력만으로 결과를 낸다. KRW 고정. */

export const DEBT_CATEGORIES: { key: LoanCategory; label: string }[] = [
  { key: "MORTGAGE", label: "주택담보" },
  { key: "CREDIT", label: "신용" },
  { key: "JEONSE", label: "전세자금" },
  { key: "CAR", label: "자동차" },
  { key: "STUDENT", label: "학자금" },
  { key: "ETC", label: "기타" },
];

const LABEL_BY_KEY: Record<LoanCategory, string> = Object.fromEntries(
  DEBT_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<LoanCategory, string>;

export interface DebtVM {
  totalKrw: number;
  monthlyPaymentTotal: number;
  items: LoanAccount[]; // sortOrder 오름차순
  count: number;
}

export function buildDebtVM(debts: LoanAccount[]): DebtVM {
  const items = [...debts].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalKrw = items.reduce((sum, d) => sum + d.balance, 0);
  const monthlyPaymentTotal = items.reduce(
    (sum, d) => sum + (d.monthlyPayment ?? 0),
    0,
  );
  return { totalKrw, monthlyPaymentTotal, items, count: items.length };
}

export function debtCategoryLabel(category: LoanCategory): string {
  return LABEL_BY_KEY[category];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- debt-service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/debt/debt-service.ts test/debt/debt-service.test.ts
git commit -m "feat(debt): buildDebtVM 순수 계산 + 카테고리 메타"
```

---

## Task 4: 백업 커버리지 (TDD)

**Files:**
- Modify: `lib/backup/backup.ts`
- Modify: `test/backup/backup.test.ts` (이미 존재. `backup-source-backfill.test.ts`는 건드리지 않는다.)

프로젝트 규칙: 새 Dexie 테이블 추가 시 `lib/backup` 동반 갱신. 현재 `SCHEMA_VERSION = 2`.

⚠️ `test/backup/backup.test.ts`는 **이미 존재**하며, 라인 37에 `expect(JSON.parse(json).schemaVersion).toBe(2);` 하드 어서션이 있다. `SCHEMA_VERSION`을 3으로 올리면 이 어서션이 깨지므로 반드시 함께 수정한다.

- [ ] **Step 1: 기존 테스트를 확장(실패하도록)**

`test/backup/backup.test.ts`의 두 번째 테스트("저축·연금·코인도 내보내고…", 라인 31-45)를 다음과 같이 수정한다:

1. 시드에 대출 1건 추가(`db.savings.put(...)` 옆에):
```typescript
    await db.debts.put({ id: "d1", category: "MORTGAGE", name: "주택담보대출", lender: "국민", balance: 120_000_000, interestRate: 3.5, monthlyPayment: 700_000, sortOrder: 0, updatedAt: 1 });
```
2. 라인 37 어서션을 `.toBe(2)` → `.toBe(3)`으로 변경하고, 테스트 제목(라인 31)의 "(schemaVersion 2)"도 "(schemaVersion 3)"으로 갱신.
3. 복원 검증부(라인 43-45 부근)에 대출 보존 확인 추가:
```typescript
    expect(await db.debts.count()).toBe(1);
    expect((await db.debts.get("d1"))?.balance).toBe(120_000_000);
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- backup`
Expected: FAIL — 아직 `SCHEMA_VERSION`이 2라 `.toBe(3)`에서 실패하고, debts가 export/import되지 않아 복원 후 0건.

- [ ] **Step 3: backup.ts에 debts 반영**

`lib/backup/backup.ts` 수정:
- 라인 5-6: `SCHEMA_VERSION = 3`, `SUPPORTED_VERSIONS = new Set([1, 2, 3])`.
- 주석(라인 3-4)에 `v3: 대출(debts) 테이블 포함` 한 줄 추가.
- `BackupData` 인터페이스에 `debts: unknown[];` 추가.
- `exportAll`의 구조분해·`Promise.all`·payload `data`에 `debts` / `db.debts.toArray()` 추가(coin과 같은 위치).
- `importAll`에서 `const debts = (data.debts ?? []) as Parameters<typeof db.debts.bulkPut>[0];` 추가, 트랜잭션 안에 `await db.debts.bulkPut(debts);` 추가.

- [ ] **Step 4: 테스트 통과 + 전체 테스트**

Run: `npm test -- backup`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/backup/backup.ts test/backup/backup.test.ts
git commit -m "feat(debt): 백업에 debts 포함(SCHEMA_VERSION 3)"
```

---

## Task 5: 쿼리 훅

**Files:**
- Create: `lib/query/use-debt.ts`

`lib/query/use-savings.ts` 미러링. 단 FX 인자 없음(KRW 고정).

- [ ] **Step 1: 훅 작성**

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app-store";
import { listDebts, upsertDebt, deleteDebt } from "@/lib/db/local-store";
import { buildDebtVM } from "@/lib/debt/debt-service";
import type { LoanAccount } from "@/lib/types";

const DEBT_KEY = ["debts"] as const;

/** 대출/부채 뷰모델을 로컬 DB에서 읽어 계산해 반환한다. 잠금 상태에서는 비활성. */
export function useDebt() {
  const locked = useAppStore((s) => s.locked);

  return useQuery({
    queryKey: DEBT_KEY,
    enabled: !locked,
    staleTime: 30_000,
    queryFn: async () => buildDebtVM(await listDebts()),
  });
}

/** 대출 추가/수정·삭제 뮤테이션. 성공 시 debts 쿼리 무효화. */
export function useDebtMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: DEBT_KEY });

  const upsert = useMutation({
    mutationFn: (d: Partial<LoanAccount> & { id?: string }) => upsertDebt(d),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteDebt(id),
    onSuccess: invalidate,
  });

  return { upsert, remove };
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/query/use-debt.ts
git commit -m "feat(debt): use-debt 쿼리/뮤테이션 훅"
```

---

## Task 6: UI — 부채 섹션 + 모달 + 순자산 히어로

> ⚠️ **착수 전 반드시 `DESIGN.md`를 읽는다.** 색·타이포·스페이싱·radius 토큰과 UX 라이팅을 준수하고, 기존 `components/ui/` 프리미티브(Card·Button·PrivacyAmount·Dialog·TextInput·Chip 등)를 재사용한다.
> **부채 금액에는 증시 시맨틱(`text-up`/`text-down`)을 쓰지 않는다.** 중립 텍스트 토큰(`text-ink`/`text-muted`)을 사용한다.
> 폼/모달은 `components/savings/SavingsAccountDialog.tsx`의 구조·톤·**prop 컨벤션**을 그대로 미러링한다.

**Files:**
- Create: `components/debt/DebtAccountDialog.tsx`
- Create: `components/debt/DebtSection.tsx`
- Modify: `app/assets/page.tsx`

- [ ] **Step 1: `DebtAccountDialog` 작성 (모달 폼)**

`components/savings/SavingsAccountDialog.tsx`를 읽고 동일 패턴으로 작성한다. **반드시 저축 다이얼로그와 동일한 컨벤션을 따른다:**
- `components/ui/Dialog` 프리미티브 사용(`open`·`title`·`onClose`·`actionLabel="저장하기"`·`onAction={handleSave}`).
- 입력은 `TextInput`, 카테고리 선택은 `Chip`(`DEBT_CATEGORIES` 순회).
- 초기값은 마운트 시 props에서 한 번만 읽는다(effect 동기화 금지). 상태 리셋은 **부모의 key 리마운트**에 의존한다.
- `parseNum` 헬퍼(콤마 제거·빈값 undefined)로 숫자 파싱. KRW 힌트가 필요하면 `formatKoreanUnit` 사용(선택).

**props(저축과 동일 이름):**
```typescript
interface DebtAccountDialogProps {
  open: boolean;
  initial?: LoanAccount | null;
  onClose: () => void;
  onSave: (input: Partial<LoanAccount> & { id?: string }) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}
```

필드: 종류(Chip, 필수·기본 `ETC`) · 대출명(name, 필수) · 금융기관(lender, 선택) · 잔액(balance, 필수, KRW 숫자) · 연 금리 %(interestRate, 선택) · 월 상환액(monthlyPayment, 선택) · 만기일(maturityDate, 선택 `type="date"`) · 비고(note, 선택). 검증: name 공백/balance 미입력 시 `setError`. 삭제 버튼은 `initial && onDelete`일 때만 노출(저축과 동일).

- [ ] **Step 2: `DebtSection` 작성 (요약 페이지용 섹션)**

목록 카드 + `+ 대출 추가` 버튼 + 다이얼로그 상태 관리. `useDebt`/`useDebtMutations` 사용.

```tsx
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PrivacyAmount } from "@/components/ui/PrivacyAmount";
import { DebtAccountDialog } from "@/components/debt/DebtAccountDialog";
import { useDebt, useDebtMutations } from "@/lib/query/use-debt";
import { debtCategoryLabel } from "@/lib/debt/debt-service";
import { formatKrw } from "@/lib/format";
import type { LoanAccount } from "@/lib/types";

export function DebtSection() {
  const { data: vm } = useDebt();
  const { upsert, remove } = useDebtMutations();
  const [editing, setEditing] = useState<LoanAccount | null>(null);
  const [open, setOpen] = useState(false);

  const items = vm?.items ?? [];

  async function handleSubmit(input: Partial<LoanAccount> & { id?: string }) {
    await upsert.mutateAsync(input);
    setOpen(false);
    setEditing(null);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold text-ink">부채</h2>
        <button
          onClick={() => { setEditing(null); setOpen(true); }}
          className="text-[13px] font-medium text-muted active:text-ink"
        >
          + 대출 추가
        </button>
      </div>

      {items.length === 0 ? (
        <Card className="py-6 text-center text-[13px] text-muted">
          등록된 대출이 없어요
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => { setEditing(d); setOpen(true); }}
                className="flex w-full items-center gap-4 rounded-[20px] bg-surface-card p-5 text-left shadow-card active:bg-surface-strong"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold text-ink">{d.name}</span>
                  <span className="text-[12px] text-muted">
                    {debtCategoryLabel(d.category)}{d.lender ? ` · ${d.lender}` : ""}
                  </span>
                </span>
                <PrivacyAmount revealLabel={`${d.name} 잔액 보기`}>
                  <span className="text-[17px] font-bold tabular-nums text-ink">
                    {formatKrw(d.balance)}
                  </span>
                </PrivacyAmount>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* key로 리마운트해 열 때마다 폼 상태를 초기화한다(저축 페이지와 동일 패턴). */}
      <DebtAccountDialog
        key={editing ? `edit-${editing.id}` : open ? "add-open" : "add-closed"}
        open={open}
        initial={editing}
        onSave={handleSubmit}
        onClose={() => { setOpen(false); setEditing(null); }}
        onDelete={editing ? async (id) => { await remove.mutateAsync(id); setOpen(false); setEditing(null); } : undefined}
      />
    </section>
  );
}
```

(DESIGN.md 토큰과 어긋나는 클래스는 착수 시 교정한다. key 리마운트 패턴은 `app/assets/savings/page.tsx`의 `SavingsAccountDialog` 사용부를 참고한다.)

- [ ] **Step 3: `app/assets/page.tsx` — 순자산 히어로 + 부채 섹션 배치**

- import 추가: `useDebt`, `DebtSection`.
- 훅 호출 추가: `const debt = useDebt();`
- 계산 수정 (라인 56 부근):

```typescript
  const total = stocksValue + savingsValue + pensionValue + coinValue;
  const debtValue = debt.data?.totalKrw ?? 0;
  const netWorth = total - debtValue;
```

- 히어로 Card(라인 75-85)를 순자산 기준으로 교체:

```tsx
        <Card variant="hero" className="flex flex-col gap-2">
          <span className="text-[13px] font-normal leading-[1.45] text-muted">순자산</span>
          <PrivacyAmount revealLabel="순자산 보기">
            <span className="text-[36px] font-bold leading-[1.2] tracking-[-0.5px] tabular-nums text-ink">
              {formatKrw(netWorth)}
            </span>
          </PrivacyAmount>
          <span className="text-[13px] font-normal leading-[1.45] text-muted">
            자산 {formatKrw(total)} · 부채 {formatKrw(debtValue)}
          </span>
        </Card>
```

- 자산 리스트(`<ul>`) 뒤, `</div>` 앞에 `<DebtSection />` 추가.
- 기존 자산 분해 리스트의 `filter((r) => r.valueKrw > 0)`는 유지(부채는 리스트에 넣지 않는다).

- [ ] **Step 4: 검증 (typecheck·lint·test)**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS

- [ ] **Step 5: 실제 화면 확인**

Run: `npm run dev` 후 `/assets` 접속. 대출 추가 → 순자산이 자산−부채로 줄고, 보조 라인에 `자산 · 부채` 표기, 부채 0원이면 순자산=자산총액으로 기존과 동일하게 보이는지 확인. (또는 `/run` 스킬 사용.)

- [ ] **Step 6: Commit**

```bash
git add components/debt app/assets/page.tsx
git commit -m "feat(debt): 자산 요약에 부채 섹션 + 순자산 히어로"
```

---

## Task 7: 최종 검증

- [ ] **Step 1: 전체 검증 통과 확인**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS

- [ ] **Step 2: 수동 QA 체크리스트**
- 대출 추가/수정/삭제가 즉시 반영되고 새로고침 후에도 유지된다(IndexedDB).
- 설정 > 백업 내보내기 → 데이터 삭제 → 가져오기 후 대출이 복원된다.
- 부채 0원일 때 요약 화면이 기존(총자산=순자산)과 동일하게 보인다.
- 금액 숨기기(privacyAmounts) ON에서 부채·순자산도 가려진다.

- [ ] **Step 3: 배포 흐름 진입**
- `dtr-deploy` 스킬을 따른다(기본: PR 프리뷰). worktree 작업이면 PR 생성 → Vercel 프리뷰 검토 → 사용자 확인 후 머지.

---

## 참고

- 코딩 스타일: `if/else` 본문은 한 줄이어도 중괄호. 중첩 대신 early return.
- `lib/*/*-service.ts` 순수 함수는 DB·비동기·`Date` 금지.
- IndexedDB는 서버/SSR 접근 금지(모든 라우트 `"use client"`).
- 스냅샷·순자산 히스토리 추이는 이번 스코프 밖(향후 확장).
