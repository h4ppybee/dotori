# 업비트 Open API 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업비트 Open API로 보유 코인·원화 예수금을 자동 동기화해, 자산 통합 새로고침 한 번에 갱신되게 한다(코인은 AUTO 코인 행, 원화 예수금은 AUTO 현금성 행).

**Architecture:** 토스 연동의 3계층(서버 프록시 → 클라이언트 라이브러리 → 릴레이) + AUTO/MANUAL·prune 패턴을 그대로 재사용한다. 업비트는 요청별 JWT(HS256) 서명이 필요하고 IP 화이트리스트가 있어, Secret Key를 고정 IP 릴레이로 보내 **릴레이가 JWT를 생성·서명**한다(토스 `relay-handlers`와 대칭). 원화 마켓 기준이라 환율은 불필요.

**Tech Stack:** Next.js 16 (App Router) · TypeScript 5 · Dexie 4 · @tanstack/react-query 5 · Fastify(릴레이) · Node crypto(HMAC) · vitest 4 + fake-indexeddb.

**Spec:** [docs/superpowers/specs/2026-07-01-upbit-integration-design.md](../specs/2026-07-01-upbit-integration-design.md)

---

## File Structure

**신규 파일**
- `lib/upbit/upbit-jwt.ts` — Access/Secret Key → HS256 JWT(`{access_key, nonce}`). 서명만. **서버 전용**(`node:crypto`).
- `lib/upbit/normalize.ts` — **순수 정규화**(`normalizeUpbitAccounts` + 타입). `node:crypto`·fetch 의존 없음 → 클라이언트(`refresh-upbit`)가 안전하게 import.
- `lib/upbit/upbit-client.ts` — 업비트 API 호출(`fetchUpbitAccounts`, `fetchUpbitTickers`, `fetchUpbitMarketNames`), `UpbitError`. **서버 전용**(`upbit-jwt` → `node:crypto` import). 릴레이·`app/api/upbit/*`에서만 import.
- `lib/upbit/relay-endpoint.ts` — 릴레이/Next 프록시 분기(`upbitEndpoint`).

> **번들 경계 규칙(중요):** 기존 `lib/sync/refresh.ts`(클라이언트)가 `lib/toss/toss-client.ts`(서버 전용)를 절대 import하지 않는 것과 동일하게, **`lib/sync/refresh-upbit.ts`는 `upbit-client.ts`·`upbit-jwt.ts`를 import하지 않는다.** 정규화는 `lib/upbit/normalize.ts`만 import하고, API 호출은 프록시(`upbitEndpoint`)로 나간다. `node:crypto`는 릴레이/서버 라우트에서만 실행된다.
- `lib/sync/refresh-upbit.ts` — `refreshUpbit({ key, now })` 오케스트레이션.
- `app/api/upbit/accounts/route.ts` · `app/api/upbit/tickers/route.ts` · `app/api/upbit/markets/route.ts` — 로컬 개발 폴백 프록시.
- `relay/src/upbit-handlers.ts` — 릴레이 핸들러 맵.
- 테스트: `test/upbit/upbit-jwt.test.ts`, `test/upbit/normalize.test.ts`, `test/sync/refresh-upbit.test.ts`, `test/db/upbit-store.test.ts`, `test/backup/backup-source-backfill.test.ts`.

**수정 파일**
- `lib/types.ts` — `ConnectionType`에 `"UPBIT_API"`; `CoinHolding`/`SavingsAccount`에 `source`/`connectionId`(+코인 `market`).
- `lib/db/schema.ts` — Dexie v5(coin·savings 인덱스).
- `lib/db/local-store.ts` — `upsertAutoCoin`/`pruneAutoCoins`/`upsertAutoSavings`/`pruneAutoSavings`; 기존 수동 CRUD가 `source` 기본값 채우도록 보정.
- `lib/query/use-assets-refresh.ts` — `refreshUpbit` 합류 + `coin`/`savings` invalidate.
- `lib/backup/backup.ts` — import 시 coin/savings `source` backfill.
- `relay/src/routes.ts` — `/upbit/*` 라우트 등록.
- `components/settings/ConnectionForm.tsx` — 연동 타입 선택 + 업비트 Access/Secret Key 입력.
- `components/coin/CoinManageList.tsx` (+ `CoinAccountDialog.tsx`) — AUTO 행 편집 잠금 + 배지.
- `components/savings/*`(현금성 편집 목록) — AUTO 예수금 행 표시·잠금.
- `DESIGN.md` — AUTO 연동 배지/잠금 규칙 추가 시 함께 반영.

**작업 규칙:** 각 태스크 후 `npm run typecheck && npm run lint && npm test` 통과 확인. 커밋 메시지는 `dtr-git-commit-convention`을 따른다. UI 작업(Task 9~11)은 `DESIGN.md`를 먼저 읽고 토큰/프리미티브를 재사용한다.

---

## Task 1: 타입 확장 + Dexie v5 마이그레이션

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/db/schema.ts:34-58`
- Test: `test/db/upbit-store.test.ts` (마이그레이션 검증은 다음 태스크와 함께)

- [ ] **Step 1: 타입 확장**

`lib/types.ts`:
```ts
export type ConnectionType = "TOSS_API" | "UPBIT_API" | "MANUAL";
```
`CoinHolding`에 추가:
```ts
  source: HoldingSource;   // "AUTO" | "MANUAL"
  connectionId?: string;   // AUTO 행만: 소속 업비트 연결
  market?: string;         // AUTO 행만: "KRW-BTC"
```
`SavingsAccount`에 추가:
```ts
  source: HoldingSource;   // "AUTO" | "MANUAL"
  connectionId?: string;   // AUTO 행만
```

- [ ] **Step 2: Dexie v5 추가**

`lib/db/schema.ts` 생성자 끝(v4 뒤)에 추가. **coin·savings 두 테이블만 재선언**, 나머지는 상속:
```ts
    // v5: 코인/저축 AUTO 연동 필드 인덱스 추가
    this.version(5).stores({
      coin: "id, sortOrder, connectionId, source",
      savings: "id, category, sortOrder, connectionId, source",
    });
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: `source`가 필수가 되어 기존 `upsertCoin`/`upsertSavings` 및 테스트에서 타입 에러가 날 수 있다. 다음 스텝에서 기본값 보정으로 해소한다.

- [ ] **Step 4: 수동 CRUD 기본값 보정**

`lib/db/local-store.ts`의 `upsertCoin`/`upsertSavings`가 반환 객체에 `source: existing?.source ?? "MANUAL"`를 채우도록 수정(수동 입력 행은 항상 MANUAL). `connectionId`/`market`은 넘어오지 않으면 그대로 undefined.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db/schema.ts lib/db/local-store.ts
git commit -m "feat(db): 코인·저축 AUTO 연동 필드 + Dexie v5 + UPBIT_API 타입"
```

---

## Task 2: local-store AUTO 헬퍼 (upsert/prune)

**Files:**
- Modify: `lib/db/local-store.ts`
- Test: `test/db/upbit-store.test.ts`

기존 `pruneAutoHoldings`([lib/db/local-store.ts:41-47](../../../lib/db/local-store.ts))·`upsertAutoHolding` 패턴을 그대로 따른다.

- [ ] **Step 1: 실패 테스트 작성**

`test/db/upbit-store.test.ts` (fake-indexeddb 사용, 기존 store 테스트 셋업 참고):
```ts
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { db } from "@/lib/db/schema";
import {
  upsertAutoCoin, pruneAutoCoins, listCoin,
  upsertAutoSavings, pruneAutoSavings, listSavings, upsertCoin,
} from "@/lib/db/local-store";

beforeEach(async () => {
  await db.coin.clear();
  await db.savings.clear();
});

describe("upsertAutoCoin / pruneAutoCoins", () => {
  it("AUTO 코인을 안정적 id로 upsert하고, 다시 넣으면 수량/현재가만 갱신한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.1, buyPrice: 5000, currentPrice: 6000 });
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.2, buyPrice: 5000, currentPrice: 7000 });
    const rows = await listCoin();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("upbit:c1:KRW-BTC");
    expect(rows[0].source).toBe("AUTO");
    expect(rows[0].quantity).toBe(0.2);
    expect(rows[0].currentPrice).toBe(7000);
  });

  it("currentPrice 미지정(ticker 실패) 시 기존 현재가를 유지한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.1, buyPrice: 5000, currentPrice: 6000 });
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 0.1, buyPrice: 5000 }); // currentPrice 없음
    const rows = await listCoin();
    expect(rows[0].currentPrice).toBe(6000); // 이전값 유지
  });

  it("신규 행에 currentPrice가 없으면 buyPrice로 폴백한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-XRP", name: "리플", quantity: 10, buyPrice: 700 }); // currentPrice 없음
    const rows = await listCoin();
    const xrp = rows.find((r) => r.market === "KRW-XRP")!;
    expect(xrp.currentPrice).toBe(700);
  });

  it("prune은 해당 연결의 AUTO 행 중 seen에 없는 것만 지우고 MANUAL·타 연결은 보존한다", async () => {
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-BTC", name: "비트코인", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await upsertAutoCoin({ connectionId: "c1", market: "KRW-ETH", name: "이더리움", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await upsertAutoCoin({ connectionId: "c2", market: "KRW-BTC", name: "비트코인", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await upsertCoin({ name: "손입력", quantity: 1, buyPrice: 1, currentPrice: 1 });
    await pruneAutoCoins("c1", ["KRW-BTC"]); // ETH 매도됨
    const rows = await listCoin();
    const ids = rows.map((r) => r.id).sort();
    expect(rows.find((r) => r.market === "KRW-ETH" && r.connectionId === "c1")).toBeUndefined();
    expect(rows.find((r) => r.id === "upbit:c1:KRW-BTC")).toBeDefined();
    expect(rows.find((r) => r.id === "upbit:c2:KRW-BTC")).toBeDefined();
    expect(rows.find((r) => r.name === "손입력")).toBeDefined();
    expect(ids).toContain("upbit:c2:KRW-BTC");
  });
});

describe("upsertAutoSavings / pruneAutoSavings", () => {
  it("업비트 KRW 예수금을 연결당 1개 AUTO 현금성 행으로 upsert한다", async () => {
    await upsertAutoSavings({ connectionId: "c1", amount: 100000 });
    await upsertAutoSavings({ connectionId: "c1", amount: 250000 });
    const rows = await listSavings();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("upbit-krw:c1");
    expect(rows[0].source).toBe("AUTO");
    expect(rows[0].category).toBe("CHECKING");
    expect(rows[0].currency).toBe("KRW");
    expect(rows[0].amount).toBe(250000);
  });

  it("pruneAutoSavings는 해당 연결 AUTO 예수금 행만 삭제한다", async () => {
    await upsertAutoSavings({ connectionId: "c1", amount: 100000 });
    await pruneAutoSavings("c1");
    expect(await listSavings()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- upbit-store`
Expected: FAIL (`upsertAutoCoin` 등 미정의)

- [ ] **Step 3: 헬퍼 구현**

`lib/db/local-store.ts`에 추가:
```ts
export async function upsertAutoCoin(row: {
  connectionId: string; market: string; name: string;
  quantity: number; buyPrice: number; currentPrice?: number; exchange?: string;
}): Promise<void> {
  const id = `upbit:${row.connectionId}:${row.market}`;
  const existing = await db.coin.get(id);
  // currentPrice 미지정(ticker 실패): 기존 행이면 이전값 유지, 신규면 buyPrice 폴백
  const currentPrice = row.currentPrice ?? existing?.currentPrice ?? row.buyPrice;
  await db.coin.put({
    id,
    name: row.name,
    exchange: row.exchange ?? "업비트",
    quantity: row.quantity,
    buyPrice: row.buyPrice,
    currentPrice,
    sortOrder: existing?.sortOrder ?? (await nextCoinSortOrder()),
    updatedAt: Date.now(),
    source: "AUTO",
    connectionId: row.connectionId,
    market: row.market,
  });
}

export async function pruneAutoCoins(connectionId: string, keepMarkets: string[]): Promise<void> {
  const keep = new Set(keepMarkets);
  const rows = await db.coin
    .where("connectionId").equals(connectionId)
    .and((x) => x.source === "AUTO" && !keep.has(x.market ?? "")).toArray();
  await db.coin.bulkDelete(rows.map((r) => r.id));
}

export async function upsertAutoSavings(row: { connectionId: string; amount: number }): Promise<void> {
  const id = `upbit-krw:${row.connectionId}`;
  const existing = await db.savings.get(id);
  await db.savings.put({
    id,
    category: "CHECKING",
    name: "업비트 원화",
    bank: "업비트",
    amount: row.amount,
    currency: "KRW",
    sortOrder: existing?.sortOrder ?? (await nextSavingsSortOrder("CHECKING")),
    updatedAt: Date.now(),
    source: "AUTO",
    connectionId: row.connectionId,
  });
}

export async function pruneAutoSavings(connectionId: string): Promise<void> {
  const rows = await db.savings
    .where("connectionId").equals(connectionId)
    .and((x) => x.source === "AUTO").toArray();
  await db.savings.bulkDelete(rows.map((r) => r.id));
}
```
> 주의: `nextCoinSortOrder`/`nextSavingsSortOrder`는 기존 private 함수. 파일 내에서 접근 가능. `Date.now()`는 store 계층이라 허용(순수 계산 계층 아님).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- upbit-store`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db/local-store.ts test/db/upbit-store.test.ts
git commit -m "feat(db): 업비트 AUTO 코인/예수금 upsert·prune 헬퍼"
```

---

## Task 3: upbit-jwt (HS256 서명)

**Files:**
- Create: `lib/upbit/upbit-jwt.ts`
- Test: `test/upbit/upbit-jwt.test.ts`

업비트 JWT는 헤더 `{alg:"HS256",typ:"JWT"}`, payload `{access_key, nonce}`, 서명 `HMAC-SHA256(secretKey, base64url(header)+"."+base64url(payload))`. base64**url**(패딩 제거) 사용.

- [ ] **Step 1: 실패 테스트 작성**

`test/upbit/upbit-jwt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { buildUpbitJwt } from "@/lib/upbit/upbit-jwt";

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("buildUpbitJwt", () => {
  it("HS256 헤더와 access_key/nonce payload를 담고 secretKey로 서명한다", () => {
    const jwt = buildUpbitJwt("AK", "SK");
    const [h, p, sig] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "HS256", typ: "JWT" });
    const payload = decode(p);
    expect(payload.access_key).toBe("AK");
    expect(typeof payload.nonce).toBe("string");
    expect(payload.nonce.length).toBeGreaterThan(0);
    const expected = crypto.createHmac("sha256", "SK").update(`${h}.${p}`).digest("base64url");
    expect(sig).toBe(expected);
  });

  it("호출마다 nonce가 달라진다", () => {
    const a = buildUpbitJwt("AK", "SK").split(".")[1];
    const b = buildUpbitJwt("AK", "SK").split(".")[1];
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- upbit-jwt`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`lib/upbit/upbit-jwt.ts`:
```ts
import crypto from "node:crypto";

const b64url = (obj: unknown): string =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/** 업비트 요청용 JWT. 파라미터 없는 요청(accounts) 전용 → query_hash 미포함. */
export function buildUpbitJwt(accessKey: string, secretKey: string): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ access_key: accessKey, nonce: crypto.randomUUID() });
  const sig = crypto.createHmac("sha256", secretKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}
```
> 서버(릴레이/Next 라우트)에서만 실행. `node:crypto` 사용이라 브라우저 번들에 포함되지 않게 클라이언트에서 import 금지.

- [ ] **Step 4: 통과 확인**

Run: `npm test -- upbit-jwt`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/upbit/upbit-jwt.ts test/upbit/upbit-jwt.test.ts
git commit -m "feat(upbit): HS256 JWT 서명 유틸"
```

---

## Task 4: normalize (순수 정규화) + upbit-client (fetch)

**Files:**
- Create: `lib/upbit/normalize.ts` (순수, node:crypto 없음 — 클라이언트 공용)
- Create: `lib/upbit/upbit-client.ts` (fetch + UpbitError — 서버 전용)
- Test: `test/upbit/normalize.test.ts`

토스 `toss-client.ts`의 `TossError`·`toNum`·타임아웃 패턴 참고. **정규화는 서명·fetch와 분리**해 클라이언트 번들에 `node:crypto`가 끌려오지 않게 한다.

`currentPrice`는 **optional**로 둔다: ticker 성공분만 값이 채워지고, 실패 시 `undefined`를 남겨 upsert 단계가 기존 시세를 유지하도록 한다(스펙 §prune 정책 "ticker 실패 시 기존 currentPrice 유지").

- [ ] **Step 1: 실패 테스트 작성**

`test/upbit/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeUpbitAccounts } from "@/lib/upbit/normalize";

const rows = [
  { currency: "KRW", balance: "150000.0", locked: "50000.0", avg_buy_price: "0", unit_currency: "KRW" },
  { currency: "BTC", balance: "0.1", locked: "0.0", avg_buy_price: "50000000", unit_currency: "KRW" },
  { currency: "ETH", balance: "1.0", locked: "0.5", avg_buy_price: "3000000", unit_currency: "KRW" },
];
const names = { "KRW-BTC": "비트코인", "KRW-ETH": "이더리움" };
const prices = { "KRW-BTC": 60000000, "KRW-ETH": 3500000 };

describe("normalizeUpbitAccounts", () => {
  it("KRW는 예수금(balance+locked), 나머지는 코인으로 분리한다", () => {
    const { coins, cash } = normalizeUpbitAccounts(rows, names, prices);
    expect(cash).toEqual({ currency: "KRW", amount: 200000 });
    expect(coins).toHaveLength(2);
    const btc = coins.find((c) => c.market === "KRW-BTC")!;
    expect(btc).toMatchObject({ currency: "BTC", name: "비트코인", quantity: 0.1, avgBuyPrice: 50000000, currentPrice: 60000000 });
    const eth = coins.find((c) => c.market === "KRW-ETH")!;
    expect(eth.quantity).toBe(1.5); // balance + locked
  });

  it("현재가 조회 실패(price 없음) 시 currentPrice는 undefined로 둔다(폴백은 upsert 단계 책임)", () => {
    const { coins } = normalizeUpbitAccounts([rows[1]], names, {});
    expect(coins[0].currentPrice).toBeUndefined();
  });

  it("한글명 매핑 실패 시 currency 코드를 이름으로 쓴다", () => {
    const { coins } = normalizeUpbitAccounts([rows[1]], {}, prices);
    expect(coins[0].name).toBe("BTC");
  });

  it("예수금이 없으면 cash는 null", () => {
    const { cash } = normalizeUpbitAccounts([rows[1]], names, prices);
    expect(cash).toBeNull();
  });

  it("수량 0 자산은 코인에서 제외한다", () => {
    const zero = [{ currency: "XRP", balance: "0", locked: "0", avg_buy_price: "0", unit_currency: "KRW" }];
    const { coins } = normalizeUpbitAccounts(zero, names, prices);
    expect(coins).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- normalize`
Expected: FAIL

- [ ] **Step 3: normalize.ts 구현 (순수)**

`lib/upbit/normalize.ts`:
```ts
export interface NormalizedUpbitCoin {
  market: string; currency: string; name: string;
  quantity: number; avgBuyPrice: number;
  currentPrice?: number; // ticker 성공분만. undefined면 upsert가 기존값 유지 → 신규는 avgBuyPrice 폴백
}
export interface NormalizedUpbitCash { currency: "KRW"; amount: number; }
export interface UpbitAccountsResult { coins: NormalizedUpbitCoin[]; cash: NormalizedUpbitCash | null; }

export type RawUpbitAccount = {
  currency?: string; balance?: string; locked?: string; avg_buy_price?: string; unit_currency?: string;
};

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function normalizeUpbitAccounts(
  rows: RawUpbitAccount[],
  names: Record<string, string>,
  prices: Record<string, number>,
): UpbitAccountsResult {
  let cash: NormalizedUpbitCash | null = null;
  const coins: NormalizedUpbitCoin[] = [];
  for (const r of rows) {
    const currency = String(r.currency ?? "");
    if (!currency) { continue; }
    const qty = toNum(r.balance) + toNum(r.locked);
    if (currency === "KRW") {
      if (qty > 0) { cash = { currency: "KRW", amount: qty }; }
      continue;
    }
    if (qty <= 0) { continue; }
    const market = `KRW-${currency}`;
    coins.push({
      market, currency,
      name: names[market] ?? currency,
      quantity: qty,
      avgBuyPrice: toNum(r.avg_buy_price),
      currentPrice: market in prices ? prices[market] : undefined,
    });
  }
  return { coins, cash };
}
```

- [ ] **Step 4: upbit-client.ts 구현 (fetch, 서버 전용)**

`lib/upbit/upbit-client.ts`:
```ts
import { buildUpbitJwt } from "./upbit-jwt";
import type { RawUpbitAccount } from "./normalize";

const UPBIT_BASE = "https://api.upbit.com";

export class UpbitError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "UpbitError"; }
}

const toNum = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
};

async function upbitGet(path: string, jwt?: string): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (jwt) { headers.Authorization = `Bearer ${jwt}`; }
  const res = await fetch(`${UPBIT_BASE}${path}`, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) { throw new UpbitError(res.status, await res.text()); }
  return res.json();
}

export async function fetchUpbitAccounts(accessKey: string, secretKey: string): Promise<RawUpbitAccount[]> {
  const jwt = buildUpbitJwt(accessKey, secretKey);
  const raw = (await upbitGet("/v1/accounts", jwt)) as RawUpbitAccount[];
  return Array.isArray(raw) ? raw : [];
}

export async function fetchUpbitTickers(markets: string[]): Promise<Record<string, number>> {
  if (markets.length === 0) { return {}; }
  const raw = (await upbitGet(`/v1/ticker?markets=${markets.join(",")}`)) as { market: string; trade_price: number }[];
  const out: Record<string, number> = {};
  for (const t of raw ?? []) { out[t.market] = toNum(t.trade_price); }
  return out;
}

export async function fetchUpbitMarketNames(): Promise<Record<string, string>> {
  const raw = (await upbitGet("/v1/market/all")) as { market: string; korean_name: string }[];
  const out: Record<string, string> = {};
  for (const m of raw ?? []) { out[m.market] = m.korean_name; }
  return out;
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test -- normalize && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/upbit/normalize.ts lib/upbit/upbit-client.ts test/upbit/normalize.test.ts
git commit -m "feat(upbit): 순수 정규화 분리 + API 호출(서명은 서버 전용)"
```

---

## Task 5: relay-endpoint + Next 폴백 프록시 라우트

**Files:**
- Create: `lib/upbit/relay-endpoint.ts`
- Create: `app/api/upbit/accounts/route.ts`, `app/api/upbit/tickers/route.ts`, `app/api/upbit/markets/route.ts`

토스 `relay-endpoint.ts`·`app/api/toss/*` 그대로 대응. (라우트는 순수 로직이 적어 테스트 생략, 다음 태스크 통합에서 검증)

- [ ] **Step 1: relay-endpoint 구현**

`lib/upbit/relay-endpoint.ts`:
```ts
// 업비트 호출을 릴레이(NEXT_PUBLIC_RELAY_URL)로 보낼지 Next 라우트(/api/upbit)로 보낼지 분기.
export function upbitEndpoint(path: string): { url: string; headers: Record<string, string> } {
  const base = process.env.NEXT_PUBLIC_RELAY_URL;
  const secret = process.env.NEXT_PUBLIC_RELAY_SECRET;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (base && secret) { headers["X-Relay-Secret"] = secret; }
  return { url: base ? `${base}/upbit${path}` : `/api/upbit${path}`, headers };
}
```

- [ ] **Step 2: Next 라우트 구현 (3개)**

`app/api/upbit/accounts/route.ts`:
```ts
import { NextResponse } from "next/server";
import { fetchUpbitAccounts, UpbitError } from "@/lib/upbit/upbit-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  try {
    const { accessKey, secretKey } = await req.json();
    const rows = await fetchUpbitAccounts(accessKey, secretKey);
    return NextResponse.json({ rows }, { headers: NO_STORE });
  } catch (e) {
    const status = e instanceof UpbitError ? e.status : 400;
    return NextResponse.json({ error: "upbit_error" }, { status, headers: NO_STORE });
  }
}
```
`tickers/route.ts`: body `{ markets }` → `fetchUpbitTickers` → `{ prices }`.
`markets/route.ts`: body 없음(POST) → `fetchUpbitMarketNames` → `{ names }`.
(세 라우트 모두 동일한 try/catch·NO_STORE·runtime 설정)

- [ ] **Step 3: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/upbit/relay-endpoint.ts app/api/upbit
git commit -m "feat(upbit): 릴레이 엔드포인트 분기 + Next 폴백 프록시 라우트"
```

---

## Task 6: 릴레이 핸들러 + 라우트 등록

**Files:**
- Create: `relay/src/upbit-handlers.ts`
- Modify: `relay/src/routes.ts`

토스 `toss-handlers.ts`·`routes.ts` 패턴을 따른다. import는 `.js` 확장자(ESM), `run()` 헬퍼 재사용하되 `UpbitError`도 status 전파하도록 확장.

- [ ] **Step 1: upbit-handlers 구현**

`relay/src/upbit-handlers.ts`:
```ts
import {
  fetchUpbitAccounts, fetchUpbitTickers, fetchUpbitMarketNames,
} from "../../lib/upbit/upbit-client.js";

export const upbitHandlers = {
  accounts: (b: { accessKey: string; secretKey: string }) =>
    fetchUpbitAccounts(b.accessKey, b.secretKey).then((rows) => ({ rows })),
  tickers: (b: { markets: string[] }) =>
    fetchUpbitTickers(b.markets).then((prices) => ({ prices })),
  markets: () => fetchUpbitMarketNames().then((names) => ({ names })),
};
```

- [ ] **Step 2: routes.ts에 /upbit/* 등록 + UpbitError 처리**

`relay/src/routes.ts`:
- `run()` 헬퍼의 에러 분기에 `UpbitError`도 추가(`import { UpbitError } from "../../lib/upbit/upbit-client.js"`), `TossError`와 동일하게 `reply.code(e.status).send({ error: "upbit_error" })`.
- body schema 추가: `accountsSchema`(accessKey/secretKey minLength 1·maxLength 512), `tickersSchema`(markets 배열, items string, maxItems 500), markets는 body 없음.
- 라우트 등록:
```ts
  app.post("/upbit/accounts", { schema: { body: upbitAccountsSchema } }, (req, reply) =>
    run(reply, () => upbitHandlers.accounts(req.body as { accessKey: string; secretKey: string })));
  app.post("/upbit/tickers", { schema: { body: upbitTickersSchema } }, (req, reply) =>
    run(reply, () => upbitHandlers.tickers(req.body as { markets: string[] })));
  app.post("/upbit/markets", (req, reply) => run(reply, () => upbitHandlers.markets()));
```

- [ ] **Step 3: 릴레이 빌드/타입 확인**

Run: `cd relay && npm run build` (릴레이에 빌드 스크립트가 있으면) 또는 루트 `npm run typecheck`
Expected: PASS. 실패 시 import 경로(`.js`)·스키마 타입 확인.

- [ ] **Step 4: Commit**

```bash
git add relay/src/upbit-handlers.ts relay/src/routes.ts
git commit -m "feat(relay): 업비트 accounts/tickers/markets 핸들러 + 라우트"
```

---

## Task 7: refreshUpbit 오케스트레이션

**Files:**
- Create: `lib/sync/refresh-upbit.ts`
- Modify: `lib/sync/refresh.ts` (`interface RefreshFailure` → `export interface RefreshFailure`)
- Test: `test/sync/refresh-upbit.test.ts`

`lib/sync/refresh.ts`의 connection 루프·`proxyPost`·부분 실패 격리 패턴을 참고하되, 별도 파일에 둔다. `proxyPost`는 `upbitEndpoint` 기반으로 작성.

- [ ] **Step 1: 실패 테스트 작성**

`test/sync/refresh-upbit.test.ts` (fetch·decrypt·local-store를 목킹; 기존 `refresh.test.ts`의 목 패턴 참고):
```ts
// 검증 시나리오:
// 1) UPBIT_API 연결 1개 + 코인 2 + KRW 예수금 → upsertAutoCoin 2회, upsertAutoSavings 1회, pruneAutoCoins(conn, [markets]) 호출
// 2) 예수금 0/없음 → pruneAutoSavings(conn) 호출
// 3) accounts 실패(UpbitError) → 해당 conn은 failures에 기록, prune 미호출(보유 보존)
// 4) tickers 실패 → 코인은 여전히 upsert(현재가 폴백), prune은 정상 수행
// 5) TOSS_API 연결은 무시
```
> 목 전략: `global.fetch`를 vi.fn으로 대체해 `/markets`·`/accounts`·`/tickers` 응답을 순서대로 반환(정규화는 순수 `@/lib/upbit/normalize`가 그대로 수행하므로 목킹 불필요). `@/lib/db/local-store`의 upsert/prune는 `vi.spyOn`으로 호출 검증. `@/lib/crypto/crypto`의 `decrypt`도 목킹(clientSecretEnc → secretKey). 시나리오 3은 `/accounts` fetch가 `ok:false`를 반환하게 해 `failures` 기록 + prune 미호출 검증.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- refresh-upbit`
Expected: FAIL

- [ ] **Step 3: 구현**

`lib/sync/refresh-upbit.ts`:
```ts
import { upbitEndpoint } from "@/lib/upbit/relay-endpoint";
import { normalizeUpbitAccounts, type RawUpbitAccount } from "@/lib/upbit/normalize";
import { decrypt } from "@/lib/crypto/crypto";
import type { RefreshFailure } from "@/lib/sync/refresh"; // {connectionId,label,message} — refresh.ts에서 export 추가
import {
  listConnections, upsertAutoCoin, pruneAutoCoins, upsertAutoSavings, pruneAutoSavings,
} from "@/lib/db/local-store";

export interface UpbitRefreshResult { updated: number; failures: RefreshFailure[]; }

async function proxyPost<T>(path: string, body: unknown): Promise<T> {
  const { url, headers } = upbitEndpoint(path);
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) { throw new Error(`upbit proxy ${path} ${res.status}`); }
  return res.json() as Promise<T>;
}

export async function refreshUpbit(opts: { key: CryptoKey }): Promise<UpbitRefreshResult> {
  const failures: RefreshFailure[] = [];
  let updated = 0;
  const conns = (await listConnections()).filter((c) => c.type === "UPBIT_API");
  if (conns.length === 0) { return { updated, failures }; }

  let names: Record<string, string> = {};
  try { names = (await proxyPost<{ names: Record<string, string> }>("/markets", {})).names; }
  catch { /* 이름 없으면 currency 코드로 폴백 */ }

  for (const conn of conns) {
    try {
      const secretKey = await decrypt(opts.key, conn.clientSecretEnc!);
      const { rows } = await proxyPost<{ rows: RawUpbitAccount[] }>("/accounts", { accessKey: conn.clientId, secretKey });

      // 현재가: KRW 마켓만 조회
      const markets = [...new Set(
        rows.map((r) => r.currency)
          .filter((c): c is string => !!c && c !== "KRW")
          .map((c) => `KRW-${c}`),
      )];
      let prices: Record<string, number> = {};
      try { prices = (await proxyPost<{ prices: Record<string, number> }>("/tickers", { markets })).prices; }
      catch { /* 시세 실패 → currentPrice undefined → upsert가 기존값 유지, prune은 계속 */ }

      const { coins, cash } = normalizeUpbitAccounts(rows, names, prices);
      for (const c of coins) {
        await upsertAutoCoin({
          connectionId: conn.id, market: c.market, name: c.name,
          quantity: c.quantity, buyPrice: c.avgBuyPrice, currentPrice: c.currentPrice,
        });
      }
      await pruneAutoCoins(conn.id, coins.map((c) => c.market));
      if (cash) { await upsertAutoSavings({ connectionId: conn.id, amount: cash.amount }); }
      else { await pruneAutoSavings(conn.id); }
      updated += 1;
    } catch (e) {
      // accounts 실패 → prune 미수행(보유 보존)
      failures.push({ connectionId: conn.id, label: conn.label, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { updated, failures };
}
```
> `currentPrice` 폴백은 Task 2 `upsertAutoCoin`에서 확정됨(미지정 시 기존값 유지 → 신규면 buyPrice). refresh는 `c.currentPrice`(ticker 실패 시 undefined)를 그대로 넘기기만 한다.
> `RefreshFailure`는 현재 `lib/sync/refresh.ts`에서 미export이므로, 이 태스크에서 `export interface RefreshFailure`로 바꾼다(1줄 수정, 별도 커밋 가능).

- [ ] **Step 4: 통과 확인**

Run: `npm test -- refresh-upbit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sync/refresh-upbit.ts test/sync/refresh-upbit.test.ts
git commit -m "feat(sync): refreshUpbit — 잔고/예수금 동기화 + prune"
```

---

## Task 8: 자산 통합 새로고침 합류

**Files:**
- Modify: `lib/query/use-assets-refresh.ts`

- [ ] **Step 1: refreshUpbit 합류**

`mutationFn`에서 `refreshAll`·`refreshPensionPrices` 뒤에 순차로 `const upbit = await refreshUpbit({ key: sessionKey });` 추가. 반환 `failures`를 기존 `failures` 배열에 병합(spread).

- [ ] **Step 2: invalidate 추가**

`onSuccess`에 `queryClient.invalidateQueries({ queryKey: ["coin"] })`, `{ queryKey: ["savings"] }` 추가.

- [ ] **Step 3: typecheck + lint + test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/query/use-assets-refresh.ts
git commit -m "feat(sync): 자산 통합 새로고침에 업비트 합류 + coin/savings 무효화"
```

---

## Task 9: 백업 import backfill

**Files:**
- Modify: `lib/backup/backup.ts`
- Test: `test/backup/backup-source-backfill.test.ts`

export는 자동 포함. import 시 v5 이전 백업(coin/savings에 `source` 누락)을 `"MANUAL"`로 backfill.

- [ ] **Step 1: 실패 테스트 작성**

`test/backup/backup-source-backfill.test.ts`:
```ts
// source 누락된 coin/savings 행이 담긴 백업 JSON을 importAll로 복원하면
// 복원된 각 행의 source === "MANUAL" 이어야 한다. (connectionId 없는 순수 수동 데이터)
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- backup-source-backfill`
Expected: FAIL

- [ ] **Step 3: 구현**

`lib/backup/backup.ts`의 `importAll`에서 coin/savings bulkPut 직전에 각 행 `source`가 없으면 `"MANUAL"`로 채우는 map 추가:
```ts
const withSource = <T extends { source?: string }>(rows: T[]) =>
  rows.map((r) => ({ ...r, source: r.source ?? "MANUAL" }));
// coin/savings에 적용
```
`SCHEMA_VERSION`은 2 유지(payload 형태 불변). `SUPPORTED_VERSIONS` 그대로.

- [ ] **Step 4: 통과 확인**

Run: `npm test -- backup-source-backfill`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/backup/backup.ts test/backup/backup-source-backfill.test.ts
git commit -m "fix(backup): 구버전 복원 시 coin/savings source 기본값 backfill"
```

---

## Task 10: 설정 — ConnectionForm 업비트 지원

**Files:**
- Modify: `components/settings/ConnectionForm.tsx`

> 시작 전 `DESIGN.md`를 읽고 폼/인풋/버튼 프리미티브·UX 라이팅 규칙을 따른다. `frontend-design` 스킬 사용.

- [ ] **Step 1: 연동 타입 선택 추가**

폼에 연동 타입 선택(토스 / 업비트) 컨트롤 추가. 상태에 `type: ConnectionType` 반영. 기본은 기존 동작 유지(토스).

- [ ] **Step 2: 업비트 입력 필드**

`type === "UPBIT_API"`일 때: **Access Key**(→ `clientId`), **Secret Key**(→ `clientSecretEnc`, `encrypt(sessionKey, ...)`) 입력. 라벨/플레이스홀더는 업비트 용어로. 기존 시크릿 마스킹·변경 시에만 재암호화하는 토스 로직 재사용.

- [ ] **Step 3: 목록 타입 배지**

연동 목록 항목에 타입 배지("토스"/"업비트") 표시.

- [ ] **Step 4: typecheck + lint + 수동 확인**

Run: `npm run typecheck && npm run lint`
Expected: PASS. `npm run dev`로 설정 페이지에서 업비트 연동 추가·저장·재조회 확인(Secret 마스킹).

- [ ] **Step 5: Commit**

```bash
git add components/settings/ConnectionForm.tsx
git commit -m "feat(settings): 업비트 연동(Access/Secret Key) 입력 지원"
```

---

## Task 11: 코인·현금성 탭 AUTO 행 표시/잠금

**Files:**
- Modify: `components/coin/CoinManageList.tsx`, `components/coin/CoinAccountDialog.tsx`
- Modify: `components/savings/SavingsManageList.tsx` (현금성 편집/일괄수정 목록)

> `DESIGN.md`를 읽고 배지/잠금 표기를 정의된 토큰으로. 신규 규칙 추가 시 `DESIGN.md`도 함께 수정. `frontend-design` 스킬 사용.

- [ ] **Step 1: 코인 AUTO 행 잠금**

`CoinManageList`에서 `source === "AUTO"` 행은 수량·매수가·현재가 인라인 편집·삭제 비활성화 + "업비트" 배지. MANUAL 행만 편집/삭제. 추가 다이얼로그(`CoinAccountDialog`)는 MANUAL 전용 유지.

- [ ] **Step 2: 현금성 AUTO 행 잠금**

현금성 목록에서 업비트 예수금 AUTO 행은 편집·삭제 비활성 + "업비트" 배지. 일괄 편집/삭제는 MANUAL 행만.

- [ ] **Step 3: typecheck + lint + 수동 확인**

Run: `npm run typecheck && npm run lint`
Expected: PASS. `npm run dev`로 새로고침 후 코인 탭에 AUTO 코인·현금성 탭에 예수금이 잠금·배지와 함께 뜨는지, MANUAL 행은 여전히 편집되는지 확인.

- [ ] **Step 4: Commit**

```bash
git add components/coin components/savings DESIGN.md
git commit -m "feat(ui): 코인·현금성 AUTO 연동 행 표시·편집 잠금"
```

---

## 최종 검증 (Definition of Done)

- [ ] `npm run typecheck && npm run lint && npm test` 전부 통과.
- [ ] 개발 서버에서: 업비트 연동 추가 → 자산 통합 새로고침 → 코인 탭에 보유 코인(AUTO), 현금성 탭에 원화 예수금(AUTO)이 표시.
- [ ] 코인 일부 매도 후 새로고침 → 해당 AUTO 코인 행이 prune됨. 수동 코인·타 연결 행은 유지.
- [ ] accounts 조회 실패를 강제(잘못된 키)했을 때 기존 AUTO 행이 삭제되지 않음(prune 미수행).
- [ ] 백업 내보내기/불러오기 후 데이터 정상(구버전 백업 복원 시 source=MANUAL backfill).
- [ ] 배포는 `dtr-deploy` 스킬을 따른다(PR 프리뷰 기본, push/merge 전 사용자 확인 필수). 릴레이에 업비트 핸들러 배포 + 릴레이 고정 IP를 업비트 허용 IP에 등록해야 프리뷰에서 실동작 검증 가능.
