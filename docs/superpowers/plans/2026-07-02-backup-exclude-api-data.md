# 백업에서 API 설정·자동 데이터 분리 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백업(내보내기/불러오기)이 사용자가 직접 입력한 수동 데이터만 다루도록 바꿔, API 설정과 API로 가져온 자동 데이터를 내보내지도 덮어쓰지도 않게 한다.

**Architecture:** `lib/backup/backup.ts`의 `exportAll`은 mixed 테이블을 `type/source === "MANUAL"` 인덱스로 필터해 수동 데이터만 조회한다. `importAll`은 입력을 수동 데이터로 정제(구버전 백업의 API 설정·AUTO·캐시·settings 무시)하고, overwrite 모드에서 전체 `clear` 대신 MANUAL 행만 선택 삭제한다. `BackupPanel`은 불러오기 후 `lock()` 대신 `queryClient.invalidateQueries()`로 UI를 갱신한다.

**Tech Stack:** TypeScript, Dexie 4(IndexedDB), @tanstack/react-query 5, vitest 4 + fake-indexeddb.

**Spec:** [docs/superpowers/specs/2026-07-02-backup-exclude-api-data-design.md](../specs/2026-07-02-backup-exclude-api-data-design.md)

---

## 파일 구조

- Modify: `lib/backup/backup.ts` — `SCHEMA_VERSION` 3→4, `exportAll` 필터, `importAll` 정제 + 선택적 overwrite.
- Modify: `components/settings/BackupPanel.tsx` — `lock()` 제거 → `invalidateQueries()`, 다이얼로그/설명 문구.
- Modify: `test/backup/backup.test.ts` — 깨지는 기존 케이스 수정 + export/overwrite/import 정제 신규 케이스.
- Modify: `test/backup/backup-source-backfill.test.ts` — AUTO 행 폐기 케이스로 수정.

참고(변경 없음): `lib/db/schema.ts`(인덱스 확인), `lib/types.ts`(`ConnectionType`/`HoldingSource`), `DESIGN.md`(UX 라이팅).

---

## Task 1: `exportAll` — 수동 데이터만 내보내기 + 버전 4

**Files:**
- Modify: `lib/backup/backup.ts`
- Test: `test/backup/backup.test.ts`

- [ ] **Step 1: 신규 export 테스트 추가 + 기존 케이스 수정**

`test/backup/backup.test.ts`에 아래 신규 테스트를 추가한다(seed 헬퍼는 파일 상단 import 활용).

```ts
import { putPrice, putFx } from "@/lib/db/local-store";

it("export는 API 연결·AUTO 행·priceCache·fxRates·settings를 제외한다", async () => {
  // API 설정
  await upsertConnection({ id: "api1", memberId: "m1", type: "TOSS_API", label: "토스",
    clientId: "cid", clientSecretEnc: "enc" });
  // 수동 연결 + 수동 보유
  await upsertConnection({ id: "man1", memberId: "m1", type: "MANUAL", label: "미래에셋" });
  await upsertManualHolding({ id: "h1", connectionId: "man1", market: "KOSPI", symbol: "005930",
    name: "삼성전자", currency: "KRW", quantity: 10, avgBuyPrice: 70000, sector: "반도체" });
  // AUTO 보유
  await db.holdings.put({ id: "hAuto", connectionId: "api1", market: "KOSPI", symbol: "000660",
    name: "SK하이닉스", sector: "반도체", currency: "KRW", quantity: 5, avgBuyPrice: 100000,
    source: "AUTO", updatedAt: 1 });
  // AUTO 저축/코인
  await db.savings.put({ id: "sAuto", category: "CHECKING", name: "업비트 원화", amount: 100,
    sortOrder: 0, updatedAt: 1, source: "AUTO", connectionId: "api1" });
  await db.coin.put({ id: "cAuto", name: "비트코인", quantity: 1, buyPrice: 1, currentPrice: 1,
    sortOrder: 0, updatedAt: 1, source: "AUTO", connectionId: "api1" });
  // 캐시 + settings
  await putPrice({ symbol: "005930", currency: "KRW", lastPrice: 71000, asOf: 1 });
  await putFx({ pair: "USDKRW", rate: 1300, asOf: 1 });
  await putSettings({ id: "app", kdfSalt: "salt1", verifier: "ver1", schemaVersion: 1 });

  const parsed = JSON.parse(await exportAll()) as {
    schemaVersion: number;
    data: Record<string, unknown[] | undefined>;
  };

  expect(parsed.schemaVersion).toBe(4);
  // API 연결 제외, MANUAL 연결만
  expect((parsed.data.connections as { id: string }[]).map((c) => c.id)).toEqual(["man1"]);
  // MANUAL 보유만
  expect((parsed.data.holdings as { id: string }[]).map((h) => h.id)).toEqual(["h1"]);
  // AUTO 저축/코인 제외 → 빈 배열
  expect(parsed.data.savings).toEqual([]);
  expect(parsed.data.coin).toEqual([]);
  // 캐시·settings 키 자체가 없음
  expect(parsed.data.priceCache).toBeUndefined();
  expect(parsed.data.fxRates).toBeUndefined();
  expect(parsed.data.settings).toBeUndefined();
});
```

같은 파일의 기존 케이스 2건을 새 동작에 맞게 수정한다.

1. "내보내기 후 DB를 비우고 덮어쓰기로 불러오면 데이터가 동일하게 복원된다": settings는 더 이상 백업되지 않으므로 마지막 assertion을 교체한다.

```ts
    // (기존) const settings = await db.settings.get("app");
    // (기존) expect(settings?.kdfSalt).toBe("salt1");
    // (변경) settings는 백업에서 제외되므로 복원되지 않는다
    expect(await db.settings.get("app")).toBeUndefined();
```

2. "저축·연금·코인도 내보내고 덮어쓰기로 복원된다 (schemaVersion 3)": 제목과 버전 assertion을 4로 바꾼다. savings/coin seed의 `source: "MANUAL"`은 유지(그대로 복원되어야 함).

```ts
  it("저축·연금·코인도 내보내고 덮어쓰기로 복원된다 (schemaVersion 4)", async () => {
    // ...seed 동일...
    const json = await exportAll();
    expect(JSON.parse(json).schemaVersion).toBe(4);
    // ...나머지 동일...
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/backup/backup.test.ts`
Expected: FAIL — 신규 export 테스트는 `schemaVersion`이 3이고 API/AUTO/캐시/settings가 포함돼 실패, 수정한 두 케이스도 실패.

- [ ] **Step 3: `exportAll` + 버전 구현**

`lib/backup/backup.ts` 상단 주석·버전과 `BackupData`·`exportAll`을 아래로 교체한다.

```ts
import { db } from "@/lib/db/schema";

// 백업 payload 버전(Dexie DB 버전과는 독립된 네임스페이스).
// v2: 저축·연금·코인 포함. v3: 대출 포함.
// v4: 사용자가 직접 입력한 수동 데이터만 백업. API 설정·AUTO 데이터·시세/환율 캐시·settings 제외.
// 구버전(v1~v3) 백업도 계속 불러올 수 있다(그 안의 API 설정·AUTO·캐시·settings는 무시).
export const SCHEMA_VERSION = 4;
const SUPPORTED_VERSIONS = new Set([1, 2, 3, 4]);

interface BackupData {
  members: unknown[];
  connections: unknown[];
  holdings: unknown[];
  snapshots: unknown[];
  sectorOverrides: unknown[];
  savings: unknown[];
  pension: unknown[];
  coin: unknown[];
  debts: unknown[];
}

interface BackupPayload {
  schemaVersion: number;
  exportedAt: number;
  data: Partial<BackupData>;
}

export async function exportAll(): Promise<string> {
  // 수동 데이터만 백업한다. 제외 대상:
  //  - API 설정: connections(TOSS_API/UPBIT_API), tokenCache — 기기별 민감정보
  //  - 자동 데이터: holdings/savings/coin 중 source==="AUTO" — 재연결+새로고침으로 복구
  //  - 재조회 캐시: priceCache, fxRates
  //  - 보안 앵커: settings(kdfSalt/verifier) — 보존된 API 연결 복호화 키가 이 salt에 묶여 있어 덮으면 손상
  const [
    members, connections, holdings, snapshots, sectorOverrides, savings, pension, coin, debts,
  ] = await Promise.all([
    db.members.toArray(),
    db.connections.where("type").equals("MANUAL").toArray(),
    db.holdings.where("source").equals("MANUAL").toArray(),
    db.snapshots.toArray(),
    db.sectorOverrides.toArray(),
    db.savings.where("source").equals("MANUAL").toArray(),
    db.pension.toArray(),
    db.coin.where("source").equals("MANUAL").toArray(),
    db.debts.toArray(),
  ]);

  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      members, connections, holdings, snapshots, sectorOverrides, savings, pension, coin, debts,
    },
  };

  return JSON.stringify(payload);
}
```

> 참고: `importAll`에서 쓸 타입 import는 Task 2에서 추가한다(여기서 미리 넣으면 미사용 import lint 경고).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/backup/backup.test.ts`
Expected: PASS (importAll을 아직 안 고쳤다면 import 정제 관련 신규 케이스는 Task 2에서 추가 — 이 시점 export 관련 케이스는 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/backup/backup.ts test/backup/backup.test.ts
git commit -m "feat: 백업 내보내기에서 API 설정·AUTO·캐시·settings 제외 (payload v4)"
```

---

## Task 2: `importAll` — 입력 정제 + 선택적 overwrite

**Files:**
- Modify: `lib/backup/backup.ts`
- Test: `test/backup/backup.test.ts`, `test/backup/backup-source-backfill.test.ts`

- [ ] **Step 1: import 정제/보존 테스트 추가 + 백필 테스트 수정**

`test/backup/backup.test.ts`에 추가:

```ts
it("overwrite는 API 연결·AUTO 행·priceCache를 보존하고 MANUAL 행만 교체한다", async () => {
  // 보존 대상
  await upsertConnection({ id: "api1", memberId: "m1", type: "UPBIT_API", label: "업비트",
    clientId: "cid", clientSecretEnc: "enc" });
  await db.holdings.put({ id: "hAuto", connectionId: "api1", market: "KOSPI", symbol: "000660",
    name: "SK하이닉스", sector: "반도체", currency: "KRW", quantity: 5, avgBuyPrice: 100000,
    source: "AUTO", updatedAt: 1 });
  await putPrice({ symbol: "005930", currency: "KRW", lastPrice: 71000, asOf: 1 });
  // 교체될 기존 수동 데이터
  await upsertManualHolding({ id: "hOld", connectionId: "man1", market: "KOSPI", symbol: "005930",
    name: "삼성전자", currency: "KRW", quantity: 1, avgBuyPrice: 1, sector: "반도체" });

  const backup = JSON.stringify({
    schemaVersion: 4, exportedAt: 1,
    data: { holdings: [
      { id: "hNew", connectionId: "man2", market: "KOSPI", symbol: "035420", name: "NAVER",
        sector: "인터넷", currency: "KRW", quantity: 2, avgBuyPrice: 200000, source: "MANUAL", updatedAt: 1 },
    ] },
  });

  await importAll(backup, { mode: "overwrite" });

  // API 연결·AUTO 보유·캐시 보존
  expect(await db.connections.get("api1")).toBeDefined();
  expect(await db.holdings.get("hAuto")).toBeDefined();
  expect(await db.priceCache.count()).toBe(1);
  // 기존 MANUAL 보유는 사라지고 새 MANUAL 보유만
  expect(await db.holdings.get("hOld")).toBeUndefined();
  expect(await db.holdings.get("hNew")).toBeDefined();
});

it("구버전 백업의 API 연결·AUTO 행·settings는 import에서 무시된다", async () => {
  const legacy = JSON.stringify({
    schemaVersion: 3, exportedAt: 1,
    data: {
      connections: [
        { id: "api1", memberId: "m1", type: "TOSS_API", label: "토스", clientSecretEnc: "enc",
          createdAt: 1, updatedAt: 1 },
        { id: "man1", memberId: "m1", type: "MANUAL", label: "미래에셋", createdAt: 1, updatedAt: 1 },
      ],
      holdings: [
        { id: "hAuto", connectionId: "api1", market: "KOSPI", symbol: "000660", name: "SK하이닉스",
          sector: "반도체", currency: "KRW", quantity: 5, avgBuyPrice: 100000, source: "AUTO", updatedAt: 1 },
      ],
      priceCache: [{ key: "005930|KRW", symbol: "005930", currency: "KRW", lastPrice: 1, asOf: 1 }],
      fxRates: [{ pair: "USDKRW", rate: 1300, asOf: 1 }],
      settings: [{ id: "app", kdfSalt: "backupSalt", verifier: "v", schemaVersion: 1 }],
    },
  });

  await importAll(legacy, { mode: "overwrite" });

  // MANUAL 연결만 기록, API 연결 무시
  expect(await db.connections.get("man1")).toBeDefined();
  expect(await db.connections.get("api1")).toBeUndefined();
  // AUTO 보유·캐시·settings 무시
  expect(await db.holdings.count()).toBe(0);
  expect(await db.priceCache.count()).toBe(0);
  expect(await db.fxRates.count()).toBe(0);
  expect(await db.settings.get("app")).toBeUndefined();
});
```

`test/backup/backup-source-backfill.test.ts`의 두 번째 케이스("source가 이미 있는 백업 행은 그대로 유지된다")를 AUTO 폐기 동작으로 교체한다.

```ts
  it("source가 AUTO인 백업 행은 import에서 폐기된다", async () => {
    const payload = JSON.stringify({
      schemaVersion: 2, exportedAt: Date.now(),
      data: {
        savings: [
          { id: "s2", category: "DEPOSIT", name: "업비트 원화", amount: 500, sortOrder: 0, updatedAt: 1,
            source: "AUTO", connectionId: "conn1" },
        ],
        coin: [
          { id: "c2", name: "이더리움", quantity: 1, buyPrice: 200, currentPrice: 250, sortOrder: 0,
            updatedAt: 1, source: "AUTO", connectionId: "conn1" },
        ],
      },
    });

    await importAll(payload, { mode: "overwrite" });

    expect(await db.savings.get("s2")).toBeUndefined();
    expect(await db.coin.get("c2")).toBeUndefined();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/backup/backup.test.ts test/backup/backup-source-backfill.test.ts`
Expected: FAIL — 아직 import가 API/AUTO/캐시/settings를 기록하고 overwrite가 전체 clear라 신규/수정 케이스 실패.

- [ ] **Step 3: `importAll` 구현**

`lib/backup/backup.ts` 상단에 타입 import를 추가하고(`importAll`에서 사용), `importAll` 전체를 교체한다.

```ts
// 파일 상단 import 블록에 추가:
import type { Connection, Holding, SavingsAccount, CoinHolding } from "@/lib/types";
```

```ts
export async function importAll(json: string, opts: { mode: "merge" | "overwrite" }): Promise<void> {
  let parsed: BackupPayload;
  try {
    parsed = JSON.parse(json) as BackupPayload;
  } catch {
    throw new Error("백업 파일을 읽을 수 없어요");
  }

  if (!SUPPORTED_VERSIONS.has(parsed.schemaVersion)) {
    throw new Error("백업 버전이 호환되지 않아요");
  }

  const data = parsed.data ?? {};

  // 입력 정제: 수동 데이터만 통과. 구버전 백업의 API 설정·AUTO·priceCache·fxRates·settings·tokenCache는 무시.
  const manualConnections = ((data.connections ?? []) as Connection[])
    .filter((c) => c.type === "MANUAL");
  const manualHoldings = ((data.holdings ?? []) as Holding[])
    .filter((h) => (h.source ?? "MANUAL") === "MANUAL");
  // savings/coin은 source 백필(v5 이전엔 필드 없음 → MANUAL) 후 MANUAL만 통과.
  const withSource = <T extends { source?: string }>(rows: readonly T[]): T[] =>
    rows.map((r) => ({ ...r, source: r.source ?? "MANUAL" }));
  const manualSavings = withSource((data.savings ?? []) as SavingsAccount[])
    .filter((r) => r.source === "MANUAL");
  const manualCoin = withSource((data.coin ?? []) as CoinHolding[])
    .filter((r) => r.source === "MANUAL");

  const members = (data.members ?? []) as Parameters<typeof db.members.bulkPut>[0];
  const snapshots = (data.snapshots ?? []) as Parameters<typeof db.snapshots.bulkPut>[0];
  const sectorOverrides = (data.sectorOverrides ?? []) as Parameters<typeof db.sectorOverrides.bulkPut>[0];
  const pension = (data.pension ?? []) as Parameters<typeof db.pension.bulkPut>[0];
  const debts = (data.debts ?? []) as Parameters<typeof db.debts.bulkPut>[0];

  // 트랜잭션 스코프는 db.tables 전체 유지(선택적 삭제가 여러 테이블에 걸침).
  await db.transaction("rw", db.tables, async () => {
    if (opts.mode === "overwrite") {
      // 수동 데이터만 교체. API 설정·AUTO 행·캐시·settings·session은 보존.
      await db.connections.where("type").equals("MANUAL").delete();
      await db.holdings.where("source").equals("MANUAL").delete();
      await db.coin.where("source").equals("MANUAL").delete();
      await db.savings.where("source").equals("MANUAL").delete();
      await db.pension.clear();
      await db.debts.clear();
    }
    await db.members.bulkPut(members);
    await db.connections.bulkPut(manualConnections as Parameters<typeof db.connections.bulkPut>[0]);
    await db.holdings.bulkPut(manualHoldings as Parameters<typeof db.holdings.bulkPut>[0]);
    await db.snapshots.bulkPut(snapshots);
    await db.sectorOverrides.bulkPut(sectorOverrides);
    await db.savings.bulkPut(manualSavings as Parameters<typeof db.savings.bulkPut>[0]);
    await db.pension.bulkPut(pension);
    await db.coin.bulkPut(manualCoin as Parameters<typeof db.coin.bulkPut>[0]);
    await db.debts.bulkPut(debts);
  });
}
```

- [ ] **Step 4: 백업 테스트 전체 통과 확인**

Run: `npx vitest run test/backup/`
Expected: PASS (모든 케이스).

- [ ] **Step 5: 커밋**

```bash
git add lib/backup/backup.ts test/backup/backup.test.ts test/backup/backup-source-backfill.test.ts
git commit -m "feat: 백업 불러오기에서 API 설정·AUTO 행 무시 + overwrite 선택 삭제"
```

---

## Task 3: `BackupPanel` — 강제 잠금 제거 + 문구

**Files:**
- Modify: `components/settings/BackupPanel.tsx`

> UI/카피 변경이므로 [DESIGN.md](../../../DESIGN.md)의 UX 라이팅(토스 라이팅) 규칙을 먼저 읽고 문구를 맞춘다.

- [ ] **Step 1: import·상태 교체**

`useAppStore`(lock) 의존을 `useQueryClient`로 바꾼다.

```ts
// 제거: import { useAppStore } from "@/stores/app-store";
import { useQueryClient } from "@tanstack/react-query";
```

```ts
// 제거: const lock = useAppStore((s) => s.lock);
const queryClient = useQueryClient();
```

- [ ] **Step 2: `handleImportConfirm`의 lock → invalidate**

```ts
    try {
      await importAll(pendingJson, { mode: importMode });
      setPendingJson(null);
      // salt·API 설정이 불변이라 재잠금 불필요. 불러온 수동 데이터로 UI만 갱신한다.
      await queryClient.invalidateQueries();
      setSuccessMsg("불러오기를 마쳤어요.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setErrorMsg(`불러오기에 실패했어요. ${msg}`);
    } finally {
      setImporting(false);
    }
```

(기존 lock 관련 주석 3줄과 `lock();` 호출을 제거한다.)

- [ ] **Step 3: 안내 문구 조정**

내보내기 설명:

```tsx
<p className="text-[15px] text-body-soft leading-[1.5]">
  직접 입력한 데이터를 JSON 파일로 저장해요. API 연동 설정과 자동으로 불러온 자산은 제외돼요.
</p>
```

병합 라디오 설명:

```tsx
<p className="text-[13px] text-muted leading-[1.45]">
  직접 입력한 기존 데이터를 유지하고 백업 파일의 내용을 추가해요.
</p>
```

덮어쓰기 라디오 설명:

```tsx
<p className="text-[13px] text-muted leading-[1.45]">
  직접 입력한 데이터를 백업 파일로 교체해요.
</p>
```

다이얼로그 하단 문구 교체("불러온 뒤에는 보안을 위해..." → 아래):

```tsx
<p className="text-[13px] text-muted leading-[1.45]">
  API 연동 설정과 자동으로 불러온 자산은 그대로 유지돼요.
</p>
```

- [ ] **Step 4: 타입·린트 확인**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (`useAppStore` 미사용 import가 남지 않았는지 확인.)

- [ ] **Step 5: 커밋**

```bash
git add components/settings/BackupPanel.tsx
git commit -m "feat: 불러오기 후 강제 잠금 제거(쿼리 무효화로 갱신) + 백업 안내 문구 정리"
```

---

## Task 4: 전체 검증 + 메모리 갱신

**Files:**
- Modify: 없음(검증) / 메모리 파일

- [ ] **Step 1: 전체 검증**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 PASS.

- [ ] **Step 2: 수동 확인(선택) — @verify 또는 dev 서버**

설정 화면에서 내보내기 → 파일에 API 연결/AUTO 자산/settings가 없는지, 불러오기 후 재잠금 없이 수동 데이터가 반영되고 API 연결이 유지되는지 확인.

- [ ] **Step 3: 메모리 갱신**

`backup-coverage-for-new-data` 메모리에 "새 테이블은 수동/자동(API·캐시)로 분류해 수동만 백업 대상"이라는 분류 기준을 한 줄 덧붙인다. (별도 신규 메모리 불필요.)

- [ ] **Step 4: 배포 흐름**

`dtr-deploy` 스킬에 따라 PR 프리뷰(기본) 또는 사용자가 원하면 main 직접 반영. push/merge 전 사용자 확인(메모리 `confirm-before-push`).

---

## 주의 사항

- `db.connections.where("type")`, `db.holdings/savings/coin.where("source")`는 모두 인덱스가 있어 유효하다(`lib/db/schema.ts` v1/v5).
- 백업 payload `SCHEMA_VERSION`(4)과 Dexie DB 버전(v6)은 독립 네임스페이스 — 혼동 금지.
- `settings`는 백업에서 완전 제외되므로, 불러오기 후 salt가 바뀌지 않아 세션키가 유효하다(재잠금 불필요).
- 새 기기 복원 시나리오: 사용자가 먼저 비밀번호를 설정(로컬 salt/verifier 생성)한 뒤 평문 수동 데이터를 불러온다.
