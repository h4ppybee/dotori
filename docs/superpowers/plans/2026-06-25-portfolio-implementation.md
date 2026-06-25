# dotori 주식 포트폴리오(A) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 프론트엔드 작업 태스크에서는 반드시 `frontend-design` 스킬을 사용한다.

**Goal:** 토스증권 Open API로 본인 계좌를 자동 동기화하고 타 증권사·배우자 보유분은 수동 입력하여, 통합 주식 포트폴리오(수익률·섹터/종목 비율·원화 환산)를 웹+PWA에서 보는 로컬 우선(local-first) 앱을 만든다.

**Architecture:** 모든 자산 데이터는 브라우저 IndexedDB(Dexie)에만 저장한다. 서버는 토스 API 호출만 중계하는 **무상태(stateless) 프록시**(Next.js Route Handler, 저장 0)다. 계산 로직(병합·환산·비율)은 순수 함수로 분리하고, 자격증명은 패스프레이즈 파생 키(Web Crypto)로 로컬 암호화한다. 기기 간 이동은 JSON 내보내기/불러오기로 한다.

**Tech Stack:** Next.js(App Router) / TypeScript · Dexie(IndexedDB) · Web Crypto(PBKDF2 → AES-GCM) · Zustand + TanStack Query · Tailwind CSS v4(`DESIGN.md` 토큰) · PWA(manifest + service worker) · Vitest + fake-indexeddb + @testing-library/react · 호스팅 Vercel

---

## 확정된 열린 항목 (스펙 §8)

구현 전 다음을 확정한다. 변경 시 이 계획부터 갱신한다.

| 항목 | 결정 | 근거 |
|---|---|---|
| IndexedDB 래퍼 | **Dexie** | 스펙 권장, 스키마 버전 마이그레이션 1급 지원 |
| 스키마 마이그레이션 | Dexie `version().stores()` 체인, `settings.schemaVersion`과 별개로 Dexie 내부 버전 사용 | |
| KDF | **PBKDF2** (SHA-256, 310,000 iterations) → AES-GCM-256 | Web Crypto 네이티브, wasm 번들 부담 없음. Argon2는 후속 검토 |
| prevClose 출처 | **`priceCache` 일자 경계 이월** — 가격 갱신 시 캐시의 `asOf`가 오늘 이전이면 직전 `lastPrice`를 `prevClose`로 승격 | 추가 `/candles` 호출 불필요, MVP 충분 |
| JSON 불러오기 정책 | **기본 병합(merge)**, 사용자가 덮어쓰기(overwrite) 선택 가능. 병합은 id 기준 upsert | 데이터 손실 방지 우선 |
| 패키지 매니저 | **pnpm** | |
| 테스트 러너 | **Vitest** + fake-indexeddb + @testing-library/react | jsdom 환경, IndexedDB·Web Crypto 폴리필 |

---

## 파일 구조 (생성 대상)

모듈 경계는 스펙 §2-1을 따른다. `lib/` 아래 모듈별 디렉터리, 계산 순수 함수는 `lib/portfolio/`에 격리한다.

```
dotori/
├─ package.json, tsconfig.json, next.config.ts, vitest.config.ts
├─ app/
│  ├─ layout.tsx                      앱 셸 + 폰트(Pretendard) + 잠금 게이트
│  ├─ globals.css                     Tailwind + DESIGN.md 토큰(@theme)
│  ├─ page.tsx                        5-1 포트폴리오 메인
│  ├─ holdings/page.tsx               5-2 수동 보유 관리
│  ├─ settings/page.tsx               5-3 설정(프리셋·백업·패스프레이즈)
│  └─ api/toss/
│     ├─ token/route.ts               무상태 프록시: 토큰 교환/재발급
│     ├─ accounts/route.ts            계좌 목록
│     ├─ holdings/route.ts            보유 종목
│     ├─ prices/route.ts              시세(MARKET_DATA, 배치 ≤200)
│     └─ exchange-rate/route.ts       USDKRW
├─ lib/
│  ├─ types.ts                        도메인 타입(전 모듈 공유)
│  ├─ db/
│  │  ├─ schema.ts                    Dexie 스토어 정의
│  │  └─ local-store.ts               CRUD 래퍼
│  ├─ crypto/crypto.ts                PBKDF2 키 파생 + AES-GCM 암복호화
│  ├─ toss/
│  │  ├─ toss-client.ts               (서버) 토스 호출 + 정규화 DTO
│  │  └─ toss-token.ts                (클라) 로컬 토큰 캐시 관리
│  ├─ portfolio/
│  │  ├─ merge.ts                     AUTO+MANUAL 병합
│  │  ├─ fx.ts                        KRW 환산
│  │  ├─ ratios.ts                    섹터/종목 비율
│  │  ├─ pnl.ts                       수익률·일간손익
│  │  └─ portfolio-service.ts         위를 합성한 뷰모델 빌더
│  ├─ sector/sector-map.ts            symbol→sector (시드 + override)
│  ├─ snapshot/snapshot-service.ts    일별 스냅샷 저장/조회
│  ├─ backup/backup.ts                전체 데이터 JSON export/import
│  └─ sync/refresh.ts                 4-1 갱신 오케스트레이션
├─ stores/app-store.ts                Zustand(잠금 상태·세션 키·마지막 갱신)
├─ components/                        UI 컴포넌트(토스st, DESIGN.md)
├─ public/manifest.webmanifest, icons/, sw.js
└─ test/setup.ts                      vitest 셋업(폴리필)
```

각 `lib` 모듈은 단일 책임을 가지며 독립 테스트 가능하다. `portfolio/`의 계산 함수는 순수 함수(입력→출력, 부수효과 없음)로 작성한다.

---

## 진행 순서 개요

- **Phase 0:** 프로젝트 스캐폴딩 + 테스트 하네스
- **Phase 1:** 도메인 타입 + local-store(Dexie)
- **Phase 2:** crypto(PBKDF2 + AES-GCM)
- **Phase 3:** toss-proxy(무상태 서버) + toss-client 정규화
- **Phase 4:** toss-token(클라 토큰 캐시)
- **Phase 5:** sector-map
- **Phase 6:** portfolio-service(핵심 순수 함수) — 최다 테스트
- **Phase 7:** snapshot-service
- **Phase 8:** backup(export/import)
- **Phase 9:** sync/refresh 오케스트레이션 + Zustand/React Query 배선
- **Phase 10:** UI(잠금 → 설정/프리셋 → 수동 보유 → 포트폴리오 메인) — `frontend-design`
- **Phase 11:** PWA(manifest + service worker)
- **Phase 12:** 에러 처리 마감 + 최종 검증

Phase 1~8은 서로 의존이 적어 병렬 가능하나, 순서대로 진행하면 통합이 쉽다. 각 Phase 끝에서 `pnpm test`와 `pnpm typecheck`가 통과해야 다음으로 넘어간다.

---

## Phase 0: 프로젝트 스캐폴딩

### Task 0.1: Next.js + TypeScript 초기화

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Next.js 앱 생성**

Run (대화형 프롬프트는 플래그로 제거):
```bash
pnpm create next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-pnpm
```
Expected: `app/`, `package.json`, `tsconfig.json` 생성. 기존 `DESIGN.md`/`docs/`는 보존(덮어쓰기 프롬프트 시 유지).

- [ ] **Step 2: 개발 서버 기동 확인**

Run: `pnpm dev` → 브라우저로 확인 후 종료.
Expected: 기본 페이지가 `http://localhost:3000`에서 뜸.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js App Router + TypeScript + Tailwind"
```

### Task 0.2: 테스트 하네스(Vitest + 폴리필)

**Files:**
- Create: `vitest.config.ts`, `test/setup.ts`
- Modify: `package.json`(scripts, devDeps)

- [ ] **Step 1: 의존성 설치**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb
```

- [ ] **Step 2: `vitest.config.ts` 작성**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3: `test/setup.ts` 작성** (IndexedDB·matchers 폴리필)

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

> Web Crypto는 Node 20+ jsdom에서 `globalThis.crypto.subtle`로 사용 가능. 누락 환경이면 `import { webcrypto } from "node:crypto"`로 `globalThis.crypto`를 주입하는 줄을 setup에 추가.

- [ ] **Step 4: `package.json` scripts 추가**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "next lint"
  }
}
```

- [ ] **Step 5: 스모크 테스트 작성·통과 확인**

Create `test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("harness", () => {
  it("runs", () => expect(1 + 1).toBe(2));
  it("has indexedDB", () => expect(typeof indexedDB).toBe("object"));
  it("has webcrypto", () => expect(typeof crypto.subtle).toBe("object"));
});
```
Run: `pnpm test`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add Vitest harness with fake-indexeddb + webcrypto"
```

### Task 0.3: Tailwind에 DESIGN.md 토큰 주입

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: `globals.css`에 `@theme` 토큰 정의**

`DESIGN.md` frontmatter의 colors/spacing/rounded/shadows/typography를 Tailwind v4 `@theme`로 옮긴다. 핵심 발췌(전체는 DESIGN.md 기준):
```css
@import "tailwindcss";

@theme {
  --color-primary: #3182F6;
  --color-primary-active: #1B64DA;
  --color-primary-surface: #E8F3FF;
  --color-ink: #191F28;
  --color-body: #4E5968;
  --color-muted: #8B95A1;
  --color-hairline: #E5E8EB;
  --color-canvas: #F2F4F6;
  --color-surface-card: #FFFFFF;
  --color-up: #F04452;        /* 상승/수익 = 빨강 (한국 증시) */
  --color-up-surface: #FDECEE;
  --color-down: #3182F6;      /* 하락/손실 = 파랑 */
  --color-down-surface: #E8F3FF;

  --radius-md: 12px;
  --radius-xl: 20px;
  --radius-xxl: 28px;

  --shadow-card: 0 1px 4px rgba(0,23,51,.04), 0 2px 12px rgba(0,23,51,.04);
}

body { background: var(--color-canvas); color: var(--color-ink); font-family: Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", sans-serif; }
```
Pretendard는 Phase 10에서 셀프호스팅 또는 CDN `@import`로 추가(PWA 오프라인 고려 시 셀프호스팅 권장).

- [ ] **Step 2: 빌드 확인**

Run: `pnpm build`
Expected: CSS 오류 없이 빌드 성공.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: map DESIGN.md tokens into Tailwind @theme"
```

---

## Phase 1: 도메인 타입 + local-store

### Task 1.1: 도메인 타입 정의

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: 타입 작성** (스펙 §3 데이터 모델 그대로)

```ts
export type ConnectionType = "TOSS_API" | "MANUAL";
export type HoldingSource = "AUTO" | "MANUAL";
export type Currency = "KRW" | "USD";

export interface Member { id: string; name: string; }

export interface Connection {
  id: string;
  memberId: string;
  type: ConnectionType;
  label: string;
  clientId?: string;          // TOSS_API only
  clientSecretEnc?: string;   // TOSS_API only, Web Crypto 암호문(base64)
  accountSeqs?: string[];     // 동기화 시 발견
  createdAt: number;
  updatedAt: number;
}

export interface TokenCache {
  connectionId: string;       // key
  accessTokenEnc: string;     // 암호문(base64)
  expiresAt: number;          // epoch ms
}

export interface Holding {
  id: string;
  connectionId: string;
  market: string;             // "KOSPI" | "NASDAQ" 등
  symbol: string;
  name: string;
  sector: string;             // 미분류 시 "미분류"
  currency: Currency;
  quantity: number;
  avgBuyPrice: number;        // 원통화 기준
  source: HoldingSource;
  updatedAt: number;
  manualPrice?: number;       // MANUAL 폴백 현재가
  manualPriceAsOf?: number;
}

export interface PriceCache {
  symbol: string;
  currency: Currency;
  lastPrice: number;
  prevClose?: number;
  asOf: number;
}

export interface FxRate { pair: "USDKRW"; rate: number; asOf: number; }

export interface DailySnapshot {
  date: string;               // "YYYY-MM-DD" (key)
  totalCostKrw: number;
  totalValueKrw: number;
  totalPnlKrw: number;
  returnPct: number;
  bySectorJson: string;
  byHoldingJson: string;
}

export interface Settings {
  id: "app";                  // 단일 레코드
  kdfSalt: string;            // base64
  verifier: string;          // 패스프레이즈 검증용 암호문
  lastSnapshotDate?: string;
  schemaVersion: number;
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add domain types"
```

### Task 1.2: Dexie 스키마

**Files:**
- Create: `lib/db/schema.ts`
- Test: `test/db/schema.test.ts`

- [ ] **Step 1: 의존성 설치**

```bash
pnpm add dexie
```

- [ ] **Step 2: 실패 테스트 작성**

`test/db/schema.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";

afterEach(async () => { await db.delete(); await db.open(); });

describe("db schema", () => {
  it("exposes all stores", () => {
    expect(db.connections).toBeDefined();
    expect(db.holdings).toBeDefined();
    expect(db.priceCache).toBeDefined();
    expect(db.fxRates).toBeDefined();
    expect(db.snapshots).toBeDefined();
    expect(db.settings).toBeDefined();
    expect(db.tokenCache).toBeDefined();
    expect(db.members).toBeDefined();
  });
  it("round-trips a holding", async () => {
    await db.holdings.put({ id: "h1", connectionId: "c1", market: "KOSPI",
      symbol: "005930", name: "삼성전자", sector: "반도체", currency: "KRW",
      quantity: 10, avgBuyPrice: 70000, source: "MANUAL", updatedAt: 1 });
    const got = await db.holdings.get("h1");
    expect(got?.name).toBe("삼성전자");
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm test test/db/schema.test.ts`
Expected: FAIL — `@/lib/db/schema` 모듈 없음.

- [ ] **Step 4: 스키마 구현**

`lib/db/schema.ts`:
```ts
import Dexie, { type Table } from "dexie";
import type {
  Member, Connection, TokenCache, Holding, PriceCache, FxRate, DailySnapshot, Settings,
} from "@/lib/types";

export class DotoriDB extends Dexie {
  members!: Table<Member, string>;
  connections!: Table<Connection, string>;
  tokenCache!: Table<TokenCache, string>;
  holdings!: Table<Holding, string>;
  priceCache!: Table<PriceCache, string>;     // key: `${symbol}|${currency}`
  fxRates!: Table<FxRate, string>;            // key: pair
  snapshots!: Table<DailySnapshot, string>;   // key: date
  settings!: Table<Settings, string>;         // key: id
  sectorOverrides!: Table<{ symbol: string; sector: string }, string>; // key: symbol

  constructor() {
    super("dotori");
    this.version(1).stores({
      members: "id",
      connections: "id, memberId, type",
      tokenCache: "connectionId",
      holdings: "id, connectionId, symbol, source",
      priceCache: "key, symbol",
      fxRates: "pair",
      snapshots: "date",
      settings: "id",
      sectorOverrides: "symbol",   // Phase 5에서 사용 (symbol → sector override)
    });
  }
}
export const db = new DotoriDB();
export const priceKey = (symbol: string, currency: string) => `${symbol}|${currency}`;
```
> `priceCache`는 복합 키를 명시 필드 `key`로 둔다(`priceKey()`로 생성). `PriceCache` 타입에 `key: string` 필드를 추가하고, 저장 시 채운다.

- [ ] **Step 5: 타입 보정** — `lib/types.ts`의 `PriceCache`에 `key: string;` 추가.

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm test test/db/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Dexie schema for all object stores"
```

### Task 1.3: local-store CRUD 래퍼

**Files:**
- Create: `lib/db/local-store.ts`
- Test: `test/db/local-store.test.ts`

- [ ] **Step 1: 실패 테스트 작성** (connection/holding upsert, priceCache 키 처리)

`test/db/local-store.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import * as store from "@/lib/db/local-store";

afterEach(async () => { await db.delete(); await db.open(); });

describe("local-store", () => {
  it("upserts a connection and lists it", async () => {
    const c = await store.upsertConnection({ memberId: "m1", type: "MANUAL", label: "미래에셋" });
    expect(c.id).toBeTruthy();
    const all = await store.listConnections();
    expect(all).toHaveLength(1);
  });

  it("upserts AUTO holdings by connectionId+symbol (no duplicate)", async () => {
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 10, avgBuyPrice: 70000, sector: "반도체" });
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 12, avgBuyPrice: 71000, sector: "반도체" });
    const holdings = await store.listHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(12);
    expect(holdings[0].source).toBe("AUTO");
  });

  it("stores price with composite key", async () => {
    await store.putPrice({ symbol: "005930", currency: "KRW", lastPrice: 72000, asOf: 100 });
    const p = await store.getPrice("005930", "KRW");
    expect(p?.lastPrice).toBe(72000);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test test/db/local-store.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`lib/db/local-store.ts` — id 생성은 `crypto.randomUUID()` 사용. 핵심 함수:
```ts
import { db, priceKey } from "@/lib/db/schema";
import type { Connection, Holding, PriceCache, FxRate, Settings, Member } from "@/lib/types";

const now = () => Date.now();
const uid = () => crypto.randomUUID();

export async function upsertConnection(
  input: Omit<Connection, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<Connection> {
  const existing = input.id ? await db.connections.get(input.id) : undefined;
  const conn: Connection = {
    ...existing,
    ...input,
    id: input.id ?? uid(),
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  } as Connection;
  await db.connections.put(conn);
  return conn;
}
export const listConnections = () => db.connections.toArray();
export const deleteConnection = (id: string) => db.connections.delete(id);

export async function upsertAutoHolding(
  h: Omit<Holding, "id" | "source" | "updatedAt">,
): Promise<void> {
  const match = await db.holdings
    .where("connectionId").equals(h.connectionId)
    .and((x) => x.symbol === h.symbol && x.source === "AUTO").first();
  await db.holdings.put({ ...match, ...h, id: match?.id ?? uid(), source: "AUTO", updatedAt: now() });
}

export async function upsertManualHolding(h: Partial<Holding> & { id?: string }): Promise<Holding> {
  const existing = h.id ? await db.holdings.get(h.id) : undefined;
  const rec = { ...existing, ...h, id: h.id ?? uid(), source: "MANUAL", updatedAt: now() } as Holding;
  await db.holdings.put(rec);
  return rec;
}
export const listHoldings = () => db.holdings.toArray();
export const deleteHolding = (id: string) => db.holdings.delete(id);

export async function putPrice(p: Omit<PriceCache, "key">): Promise<void> {
  await db.priceCache.put({ ...p, key: priceKey(p.symbol, p.currency) });
}
export const getPrice = (symbol: string, currency: string) => db.priceCache.get(priceKey(symbol, currency));
export const listPrices = () => db.priceCache.toArray();

export const putFx = (fx: FxRate) => db.fxRates.put(fx);
export const getFx = () => db.fxRates.get("USDKRW");

export const getSettings = () => db.settings.get("app");
export const putSettings = (s: Settings) => db.settings.put(s);

export const upsertMember = (m: Member) => db.members.put(m);
export const listMembers = () => db.members.toArray();
```

- [ ] **Step 4: 테스트 통과**

Run: `pnpm test test/db/local-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add local-store CRUD wrapper over Dexie"
```

---

## Phase 2: crypto (패스프레이즈 → 암복호화)

### Task 2.1: PBKDF2 키 파생 + AES-GCM 라운드트립

**Files:**
- Create: `lib/crypto/crypto.ts`
- Test: `test/crypto/crypto.test.ts`

- [ ] **Step 1: 실패 테스트 작성** (라운드트립 + 오답 패스프레이즈 거부 + verifier)

`test/crypto/crypto.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { deriveKey, encrypt, decrypt, makeSalt, makeVerifier, checkVerifier } from "@/lib/crypto/crypto";

describe("crypto", () => {
  it("round-trips ciphertext", async () => {
    const salt = makeSalt();
    const key = await deriveKey("hunter2", salt);
    const ct = await encrypt(key, "my-secret");
    expect(ct).not.toContain("my-secret");
    expect(await decrypt(key, ct)).toBe("my-secret");
  });

  it("rejects wrong passphrase via verifier", async () => {
    const salt = makeSalt();
    const good = await deriveKey("hunter2", salt);
    const verifier = await makeVerifier(good);
    expect(await checkVerifier(good, verifier)).toBe(true);

    const bad = await deriveKey("wrong", salt);
    expect(await checkVerifier(bad, verifier)).toBe(false);
  });

  it("fails to decrypt with wrong key", async () => {
    const salt = makeSalt();
    const ct = await encrypt(await deriveKey("a", salt), "secret");
    await expect(decrypt(await deriveKey("b", salt), ct)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test test/crypto/crypto.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현** (Web Crypto, base64 직렬화, IV는 메시지에 prepend)

`lib/crypto/crypto.ts`:
```ts
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 310_000;

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function makeSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
  const [ivB64, ctB64] = payload.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return dec.decode(pt);
}

// verifier: 고정 문구를 암호화해 settings에 보관. 복호 성공 = 올바른 패스프레이즈
const VERIFIER_PLAINTEXT = "dotori-verifier-v1";
export const makeVerifier = (key: CryptoKey) => encrypt(key, VERIFIER_PLAINTEXT);
export async function checkVerifier(key: CryptoKey, verifier: string): Promise<boolean> {
  try { return (await decrypt(key, verifier)) === VERIFIER_PLAINTEXT; }
  catch { return false; }
}
```

- [ ] **Step 4: 테스트 통과**

Run: `pnpm test test/crypto/crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Web Crypto passphrase-derived encryption + verifier"
```

---

## Phase 3: toss-proxy (무상태 서버)

> **무저장 계약(스펙 §4-1):** 프록시는 자격증명/토큰/응답을 **로그·저장하지 않는다.** 라우트 핸들러에 `console.log(요청본문)` 류를 절대 넣지 않고, 응답을 외부 저장소에 쓰지 않는다. 테스트로 이를 검증한다.

> 토스 실제 엔드포인트 경로/스키마는 토스 Open API 문서 기준으로 구현 시 확정한다. 아래 `toss-client.ts`는 호출+정규화를 캡슐화하므로 경로 변경 시 한 곳만 고친다.

### Task 3.1: toss-client 정규화 함수 (서버, 순수에 가깝게)

**Files:**
- Create: `lib/toss/toss-client.ts`
- Test: `test/toss/toss-client.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `fetch`를 주입/목킹하여 정규화 검증

`test/toss/toss-client.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { normalizeHoldings, normalizePrices, normalizeAccounts } from "@/lib/toss/toss-client";

describe("toss-client normalizers", () => {
  it("normalizes accounts response", () => {
    const raw = { result: [{ accountSeq: "A1" }, { accountSeq: "A2" }] };
    expect(normalizeAccounts(raw)).toEqual(["A1", "A2"]);
  });

  it("normalizes holdings into domain shape", () => {
    const raw = { result: [{
      symbol: "005930", name: "삼성전자", market: "KOSPI", currency: "KRW",
      quantity: 10, avgPrice: 70000, dailyProfitLoss: 1500,
    }] };
    const out = normalizeHoldings(raw);
    expect(out[0]).toMatchObject({ symbol: "005930", quantity: 10, avgBuyPrice: 70000, dailyPnl: 1500 });
  });

  it("normalizes prices keyed by symbol", () => {
    const raw = { result: [{ symbol: "005930", currency: "KRW", price: 72000 }] };
    expect(normalizePrices(raw)).toEqual([{ symbol: "005930", currency: "KRW", lastPrice: 72000 }]);
  });
});
```

- [ ] **Step 2: 실패 확인** → Run: `pnpm test test/toss/toss-client.test.ts` → FAIL.

- [ ] **Step 3: 구현** — 정규화 함수 + 호출 함수(자격증명·토큰을 인자로 받음, 저장 없음)

`lib/toss/toss-client.ts`:
```ts
const TOSS_BASE = process.env.TOSS_API_BASE ?? "https://openapi.tossinvest.com"; // 구현 시 실제 base 확정

export interface NormalizedHolding {
  symbol: string; name: string; market: string; currency: "KRW" | "USD";
  quantity: number; avgBuyPrice: number; dailyPnl?: number;
}
export interface NormalizedPrice { symbol: string; currency: "KRW" | "USD"; lastPrice: number; }

export const normalizeAccounts = (raw: any): string[] =>
  (raw?.result ?? []).map((a: any) => a.accountSeq);

export const normalizeHoldings = (raw: any): NormalizedHolding[] =>
  (raw?.result ?? []).map((h: any) => ({
    symbol: h.symbol, name: h.name, market: h.market, currency: h.currency,
    quantity: Number(h.quantity), avgBuyPrice: Number(h.avgPrice),
    dailyPnl: h.dailyProfitLoss != null ? Number(h.dailyProfitLoss) : undefined,
  }));

export const normalizePrices = (raw: any): NormalizedPrice[] =>
  (raw?.result ?? []).map((p: any) => ({ symbol: p.symbol, currency: p.currency, lastPrice: Number(p.price) }));

// --- 토스 호출(저장 없음). 토큰/자격증명은 호출자가 전달 ---
export async function exchangeToken(clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(`${TOSS_BASE}/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) { throw new TossError(res.status, await res.text()); }
  const j = await res.json();
  return { accessToken: j.access_token, expiresIn: j.expires_in };
}

export class TossError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "TossError"; }
}
// fetchAccounts / fetchHoldings / fetchPrices / fetchExchangeRate 도 동일 패턴(토큰 헤더, 정규화 함수 적용).
```

- [ ] **Step 4: 테스트 통과** → `pnpm test test/toss/toss-client.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: add toss-client normalizers + token exchange (no storage)"
```

### Task 3.2: 프록시 Route Handlers + 무저장 검증

**Files:**
- Create: `app/api/toss/token/route.ts`, `app/api/toss/accounts/route.ts`, `app/api/toss/holdings/route.ts`, `app/api/toss/prices/route.ts`, `app/api/toss/exchange-rate/route.ts`
- Test: `test/toss/proxy.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — 라우트 핸들러를 직접 호출(`POST(req)`), `fetch` 목킹, 401 재시도/429 백오프/무저장

`test/toss/proxy.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("toss token proxy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("exchanges token and returns it without persisting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "TKN", expires_in: 3600 }), { status: 200 })));
    const { POST } = await import("@/app/api/toss/token/route");
    const req = new Request("http://x/api/toss/token", {
      method: "POST", body: JSON.stringify({ clientId: "id", clientSecret: "sec" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.accessToken).toBe("TKN");
    // 무저장 검증(스펙 §7): 응답 캐시 금지 헤더 + 모듈이 저장 surface를 노출하지 않음
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const mod = await import("@/app/api/toss/token/route");
    expect(Object.keys(mod).filter((k) => /store|cache|db|persist/i.test(k))).toEqual([]);
  });

  it("propagates 401 with structured error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const { POST } = await import("@/app/api/toss/token/route");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ clientId: "a", clientSecret: "b" }) }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL — 라우트 없음.

- [ ] **Step 3: token route 구현**

`app/api/toss/token/route.ts`:
```ts
import { NextResponse } from "next/server";
import { exchangeToken, TossError } from "@/lib/toss/toss-client";

export const runtime = "nodejs";          // edge 캐시/로그 회피
export const dynamic = "force-dynamic";   // 캐시 금지(무저장)

export async function POST(req: Request) {
  try {
    const { clientId, clientSecret } = await req.json();
    const t = await exchangeToken(clientId, clientSecret);
    return NextResponse.json({ accessToken: t.accessToken, expiresIn: t.expiresIn }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof TossError) {
      return NextResponse.json({ error: "token_exchange_failed" }, { status: e.status });
    }
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
```

- [ ] **Step 4: accounts/holdings/prices/exchange-rate route 구현** — 동일 패턴. 공통: `Authorization: Bearer <token>`(요청 본문/헤더로 전달), `holdings`는 `X-Tossinvest-Account` 헤더, `prices`는 심볼 배열 ≤200 배치, 모두 `no-store`. 429 시 `Retry-After` 존중하여 1회 백오프 재시도 후 그대로 상태 전달. 정규화는 `toss-client` 함수 사용.

- [ ] **Step 5: 테스트 통과** → `pnpm test test/toss/proxy.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: add stateless toss proxy route handlers (no-store)"
```

---

## Phase 4: toss-token (클라 토큰 캐시)

### Task 4.1: 만료 검사 + 재발급 위임

**Files:**
- Create: `lib/toss/toss-token.ts`
- Test: `test/toss/toss-token.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — 유효 토큰이면 캐시 반환, 만료면 프록시 호출 후 암호화 저장

`test/toss/toss-token.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import { getValidToken } from "@/lib/toss/toss-token";
import { deriveKey, encrypt, makeSalt } from "@/lib/crypto/crypto";

afterEach(async () => { await db.delete(); await db.open(); vi.restoreAllMocks(); });

describe("toss-token", () => {
  it("returns cached token when not expired", async () => {
    const key = await deriveKey("pp", makeSalt());
    await db.tokenCache.put({ connectionId: "c1", accessTokenEnc: await encrypt(key, "CACHED"), expiresAt: Date.now() + 60_000 });
    const fetchSpy = vi.stubGlobal("fetch", vi.fn());
    const tok = await getValidToken({ connectionId: "c1", clientId: "id", clientSecret: "sec", key });
    expect(tok).toBe("CACHED");
    expect(fetchSpy).not.toHaveBeenCalled?.();
  });

  it("re-issues via proxy when expired and caches encrypted", async () => {
    const key = await deriveKey("pp", makeSalt());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ accessToken: "NEW", expiresIn: 3600 }), { status: 200 })));
    const tok = await getValidToken({ connectionId: "c1", clientId: "id", clientSecret: "sec", key });
    expect(tok).toBe("NEW");
    const cached = await db.tokenCache.get("c1");
    expect(cached?.accessTokenEnc).not.toContain("NEW"); // 암호화 저장
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL.

- [ ] **Step 3: 구현**

`lib/toss/toss-token.ts`:
```ts
import { db } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto/crypto";

const SKEW_MS = 30_000; // 만료 30초 전 갱신

export async function getValidToken(p: {
  connectionId: string; clientId: string; clientSecret: string; key: CryptoKey;
}): Promise<string> {
  const cached = await db.tokenCache.get(p.connectionId);
  if (cached && cached.expiresAt - SKEW_MS > Date.now()) {
    return decrypt(p.key, cached.accessTokenEnc);
  }
  const res = await fetch("/api/toss/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: p.clientId, clientSecret: p.clientSecret }),
  });
  if (!res.ok) { throw new Error("token_issue_failed"); }
  const { accessToken, expiresIn } = await res.json();
  await db.tokenCache.put({
    connectionId: p.connectionId,
    accessTokenEnc: await encrypt(p.key, accessToken),
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return accessToken;
}
```

- [ ] **Step 4: 테스트 통과** → PASS.
- [ ] **Step 5: Commit** → `git commit -m "feat: add client-side toss token cache with re-issue"`

---

## Phase 5: sector-map

### Task 5.1: symbol → sector 매핑 (시드 + override)

**Files:**
- Create: `lib/sector/sector-map.ts`, `lib/sector/seed.ts`
- Test: `test/sector/sector-map.test.ts`

> 스펙 §8: 과거 stock-scraper의 `SECTOR_MAP`은 이 저장소에 없다. `seed.ts`는 알려진 종목 소수로 시작하고, 미존재 종목은 "미분류" 폴백. override는 IndexedDB(별도 store) 또는 `sector-map` 내 Dexie 테이블에 저장.

- [ ] **Step 1: 실패 테스트 작성**

`test/sector/sector-map.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveSector } from "@/lib/sector/sector-map";

describe("sector-map", () => {
  it("resolves from seed", () => {
    expect(resolveSector("005930", {})).toBe("반도체"); // 삼성전자
  });
  it("override beats seed", () => {
    expect(resolveSector("005930", { "005930": "전자" })).toBe("전자");
  });
  it("falls back to 미분류", () => {
    expect(resolveSector("UNKNOWN", {})).toBe("미분류");
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현** — `seed.ts`에 시드 맵, `resolveSector(symbol, overrides)` 순수 함수. override 영속화는 `sectorOverrides` 테이블(Task 1.2의 v1 스키마에 이미 포함)에 `local-store` 헬퍼(`getSectorOverrides(): Promise<Record<string,string>>`, `putSectorOverride(symbol, sector)`)로 읽고 쓴다. `resolveSector`는 부수효과 없는 순수 함수로 유지하고, override 맵은 호출부에서 주입한다.
- [ ] **Step 4: 테스트 통과** → PASS.
- [ ] **Step 5: Commit** → `git commit -m "feat: add sector-map with seed + override fallback"`

---

## Phase 6: portfolio-service (핵심 순수 함수)

> 스펙 §7: 가장 많은 테스트가 여기 집중된다. AUTO+MANUAL 혼합, USD/KRW 혼합, 미분류 섹터, 일간손익(AUTO=토스값 / MANUAL=prevClose 기반 / prevClose 없음=생략)을 모두 커버한다. 모두 순수 함수.

### Task 6.1: merge — AUTO+MANUAL 병합

**Files:** Create `lib/portfolio/merge.ts` · Test `test/portfolio/merge.test.ts`

- [ ] **Step 1: 실패 테스트** — 같은 symbol이라도 source/connection이 다르면 별도 행으로 유지(증권사별 분리), 입력 정렬 보장.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — `mergeHoldings(holdings: Holding[]): Holding[]` (현재는 정렬/검증 위주, 합산 안 함 — 행 단위 표시).
- [ ] **Step 4: 통과.**
- [ ] **Step 5: Commit** → `git commit -m "feat: portfolio merge"`

### Task 6.2: fx — KRW 환산

**Files:** Create `lib/portfolio/fx.ts` · Test `test/portfolio/fx.test.ts`

- [ ] **Step 1: 실패 테스트**
```ts
import { toKrw } from "@/lib/portfolio/fx";
// KRW 그대로, USD는 환율 곱, 환율 없으면 throw 또는 null 정책 확정
expect(toKrw(1000, "KRW", 1350)).toBe(1000);
expect(toKrw(10, "USD", 1350)).toBe(13500);
```
- [ ] **Step 2~4:** 구현 `toKrw(amount, currency, usdKrw)` 순수 함수 + 통과.
- [ ] **Step 5: Commit** → `git commit -m "feat: portfolio fx conversion"`

### Task 6.3: pnl — 수익률·일간손익

**Files:** Create `lib/portfolio/pnl.ts` · Test `test/portfolio/pnl.test.ts`

- [ ] **Step 1: 실패 테스트** (세 가지 일간손익 경로)
```ts
import { holdingValue, holdingPnl, dailyPnl } from "@/lib/portfolio/pnl";
// 평가금 = qty * 현재가, 수익 = (현재가-매수가)*qty, 수익률 = 수익/원금
expect(holdingValue({ quantity: 10, price: 72000 })).toBe(720000);
// AUTO: 토스 dailyProfitLoss 그대로
expect(dailyPnl({ source: "AUTO", tossDailyPnl: 1500 })).toBe(1500);
// MANUAL + prevClose: (현재가-prevClose)*qty
expect(dailyPnl({ source: "MANUAL", price: 72000, prevClose: 70000, quantity: 10 })).toBe(20000);
// MANUAL + prevClose 없음: undefined (표시 생략)
expect(dailyPnl({ source: "MANUAL", price: 72000, quantity: 10 })).toBeUndefined();
```
- [ ] **Step 2~4:** 구현 + 통과.
- [ ] **Step 5: Commit** → `git commit -m "feat: portfolio pnl + daily pnl rules"`

### Task 6.4: ratios — 섹터/종목 비율

**Files:** Create `lib/portfolio/ratios.ts` · Test `test/portfolio/ratios.test.ts`

- [ ] **Step 1: 실패 테스트** — 섹터별 합산 비율(합 100%), 미분류 포함, 종목별 비율, 빈 입력 시 빈 배열.
- [ ] **Step 2~4:** 구현 `bySector(rows)`, `byHolding(rows)` 순수 함수(평가금 KRW 기준 비중) + 통과.
- [ ] **Step 5: Commit** → `git commit -m "feat: portfolio sector/holding ratios"`

### Task 6.5: portfolio-service — 합성 뷰모델

**Files:** Create `lib/portfolio/portfolio-service.ts` · Test `test/portfolio/portfolio-service.test.ts`

- [ ] **Step 1: 실패 테스트** — 통합 시나리오: AUTO(KRW) + MANUAL(USD, manualPrice 폴백) + 미분류 섹터 혼합 입력에서 총평가금/총수익률/일간손익/섹터·종목 비율 뷰모델 산출. priceCache 우선, 없으면 manualPrice 폴백.
```ts
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
const vm = buildPortfolio({ holdings, prices, fx: { rate: 1350 }, sectorOverrides: {} });
expect(vm.totalValueKrw).toBe(/* 계산값 */);
expect(vm.bySector.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
```
- [ ] **Step 2~4:** 구현 — merge→가격해석(priceCache 우선/ manualPrice 폴백)→fx→pnl→ratios 합성. 입력은 모두 인자(부수효과 없음).
```ts
export interface PortfolioRow {
  holding: Holding; priceKrw: number; valueKrw: number; costKrw: number;
  pnlKrw: number; returnPct: number; dailyPnlKrw?: number; sector: string;
}
export interface PortfolioVM {
  rows: PortfolioRow[];
  totalCostKrw: number; totalValueKrw: number; totalPnlKrw: number; returnPct: number;
  totalDailyPnlKrw?: number;
  bySector: { sector: string; valueKrw: number; pct: number }[];
  byHolding: { symbol: string; name: string; valueKrw: number; pct: number }[];
}
export function buildPortfolio(input: {
  holdings: Holding[]; prices: PriceCache[]; fx?: { rate: number }; sectorOverrides: Record<string,string>;
}): PortfolioVM { /* ... */ }
```
- [ ] **Step 5: Commit** → `git commit -m "feat: portfolio-service view model builder"`

---

## Phase 7: snapshot-service

### Task 7.1: 하루 1건 보장

**Files:** Create `lib/snapshot/snapshot-service.ts` · Test `test/snapshot/snapshot-service.test.ts`

- [ ] **Step 1: 실패 테스트** — `lastSnapshotDate`가 오늘이면 미저장, 아니면 저장+`lastSnapshotDate` 갱신, 같은 날 재실행 시 덮어쓰기(1건 유지). 날짜는 `today: string` 인자로 주입(테스트 결정성).
```ts
import { saveDailySnapshotIfNeeded } from "@/lib/snapshot/snapshot-service";
await saveDailySnapshotIfNeeded(vm, "2026-06-25");
await saveDailySnapshotIfNeeded(vm, "2026-06-25"); // 재실행
expect(await db.snapshots.count()).toBe(1);
```
- [ ] **Step 2~4:** 구현 — `getSettings().lastSnapshotDate` 비교, `db.snapshots.put({date, ...})`, settings 갱신. `today`는 인자로 받아 `Date` 직접 호출은 호출부(UI/sync)에서.
- [ ] **Step 5: Commit** → `git commit -m "feat: snapshot-service (one per day, idempotent)"`

---

## Phase 8: backup (JSON export/import)

### Task 8.1: export/import 라운드트립 + 검증

**Files:** Create `lib/backup/backup.ts` · Test `test/backup/backup.test.ts`

- [ ] **Step 1: 실패 테스트**
```ts
import { exportAll, importAll } from "@/lib/backup/backup";
// export → import 라운드트립 동일성
const json = await exportAll();
await db.delete(); await db.open();
await importAll(json, { mode: "overwrite" });
// 데이터 복원 확인
// schemaVersion 불일치 거부
await expect(importAll(JSON.stringify({ schemaVersion: 999, data: {} }), { mode: "overwrite" })).rejects.toThrow();
// 손상 JSON 거부 + 기존 데이터 보존
await expect(importAll("not json", { mode: "merge" })).rejects.toThrow();
```
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — `exportAll(): Promise<string>`는 모든 스토어를 `{ schemaVersion, exportedAt, data: { connections, holdings, ... } }`로 직렬화. `importAll(json, { mode })`: 파싱→schemaVersion 검증→`mode==="overwrite"`면 clear 후 put, `merge`면 id 기준 upsert. 트랜잭션으로 원자성 보장(실패 시 기존 데이터 보존).
- [ ] **Step 4: 통과.**
- [ ] **Step 5: Commit** → `git commit -m "feat: backup export/import with schema validation"`

---

## Phase 9: sync/refresh 오케스트레이션

### Task 9.1: Zustand 앱 스토어

**Files:** Create `stores/app-store.ts` · Test `test/stores/app-store.test.ts`

- [ ] **Step 1: 실패 테스트** — 초기 잠금 상태, `unlock(key)` 시 `locked=false`+세션 키 보관, `lock()` 시 키 폐기.
- [ ] **Step 2~4:** 구현 — `{ locked, sessionKey: CryptoKey | null, lastRefreshAt, unlock, lock, setLastRefresh }`. 세션 키는 메모리에만(영속화 금지).
- [ ] **Step 5: Commit** → `git commit -m "feat: zustand app store (lock + session key)"`

### Task 9.2: refresh 플로우 (4-1 통합)

**Files:** Create `lib/sync/refresh.ts` · Test `test/sync/refresh.test.ts`

- [ ] **Step 1: 실패 테스트** — 목킹된 프록시/스토어로 4-1 전 단계 통합: 토큰 획득 → accounts → holdings upsert(AUTO) → AUTO+MANUAL distinct symbol 시세 갱신(prevClose 이월 포함) → fx 갱신 → 뷰모델 반환. 한 connection 실패해도 나머지 진행(부분 실패 격리).
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현** — `refreshAll({ key }): Promise<PortfolioVM>`:
  1. `listConnections()` → TOSS_API별 `getValidToken` → accounts → holdings upsert
  2. distinct symbol 수집(AUTO+MANUAL) → `/api/toss/prices` 배치(≤200) → `putPrice` (저장 전 기존 캐시 `asOf`가 오늘 이전이면 직전 `lastPrice`를 `prevClose`로 이월)
  3. `/api/toss/exchange-rate` → `putFx`
  4. `getSectorOverrides()` 로드 → `buildPortfolio({ holdings, prices, fx, sectorOverrides })` 반환
  - try/catch로 connection 단위 격리, 실패 목록을 결과에 포함.
- [ ] **Step 4: 통과.**
- [ ] **Step 5: Commit** → `git commit -m "feat: refresh orchestration (4-1 flow) with partial-failure isolation"`

### Task 9.3: TanStack Query 배선

**Files:** Create `lib/query/client.tsx`, `lib/query/use-portfolio.ts` · Modify `app/layout.tsx`

- [ ] **Step 1:** `pnpm add @tanstack/react-query zustand` (이미 설치 시 생략).
- [ ] **Step 2:** `QueryClientProvider` 셋업 + `usePortfolio()`(IndexedDB의 holdings·prices·fx·`getSectorOverrides()`를 읽어 `buildPortfolio`로 뷰모델 생성), `useRefresh()`(mutation→`refreshAll`). 장중 자동 주기 refetch는 `refetchInterval`로(스펙 §4-3). 잠금 해제 전에는 쿼리 비활성(`enabled: !locked`).
  > **자동 트리거 중복 방지:** `refetchInterval`(장중 주기, 9.3)과 진입 시 1회 스냅샷(10.5 Step 3)은 서로 다른 트리거다. 첫 로드에서 동시 실행되어 중복 갱신되지 않도록, 진입 스냅샷은 `usePortfolio` 최초 성공 후 1회만 수행하고 주기 refetch와 동일한 mutation을 공유한다.
- [ ] **Step 3:** 타입체크 통과 확인 → `pnpm typecheck`.
- [ ] **Step 4: Commit** → `git commit -m "feat: wire TanStack Query for portfolio read + refresh"`

---

## Phase 10: UI (토스st, frontend-design)

> **모든 UI 태스크는 `frontend-design` 스킬을 사용**하고 `DESIGN.md`를 SSOT로 따른다. 카피는 §4-4 UX 라이팅 규칙(해요체·능동형·긍정형, 다이얼로그 왼쪽 버튼 "닫기"). 색: 상승=빨강 / 하락=파랑. 컴포넌트 토큰은 DESIGN.md의 `components.*` 사용.

### Task 10.1: 공용 UI 프리미티브

**Files:** Create `components/ui/{Card,Button,TextInput,Chip,Dialog,Banner,ReturnBadge,AmountText}.tsx`

- [ ] **Step 1:** `frontend-design` 스킬 적용. DESIGN.md `components` 토큰으로 프리미티브 구현(Button variants: primary/secondary/weak/text, height 52, radius md). 숫자는 tabular-nums.
- [ ] **Step 2:** 간단한 렌더 테스트(@testing-library) — Button 클릭 콜백, ReturnBadge 부호·색(상승 빨강/하락 파랑) 검증.
- [ ] **Step 3: Commit** → `git commit -m "feat: toss-style UI primitives"`

### Task 10.2: 앱 잠금 게이트 (5-4)

**Files:** Create `components/LockGate.tsx` · Modify `app/layout.tsx`

- [ ] **Step 1:** 최초 진입 → 패스프레이즈 설정(salt 생성, verifier 저장) + **기본 구성원 시드**(`upsertMember({ id, name: "나" })`, 선택적으로 "배우자"). connection·holding이 `memberId`를 참조하므로 최소 1명은 이 시점에 생성한다. 재진입 → 입력 → `deriveKey`+`checkVerifier`. 성공 시 `app-store.unlock(key)`. 실패 시 §4-4 긍정형 에러("패스프레이즈가 일치하지 않아요. 다시 입력해 주세요.").
- [ ] **Step 2:** 렌더 테스트 — 잠금 상태에서 자식 콘텐츠 미노출, 올바른 패스프레이즈 입력 시 노출.
- [ ] **Step 3: Commit** → `git commit -m "feat: passphrase lock gate"`

### Task 10.3: 설정 — 프리셋·백업·패스프레이즈 (5-3)

**Files:** Create `app/settings/page.tsx`, `components/settings/{ConnectionForm,BackupPanel}.tsx`

- [ ] **Step 1:** 토스 프리셋 CRUD(label, member, client_id, client_secret 마스킹 입력 → `encrypt`로 `clientSecretEnc` 저장). JSON 내보내기/불러오기(`backup`, 병합/덮어쓰기 선택 다이얼로그, 왼쪽 "닫기"). 패스프레이즈 변경(재암호화). 로컬 데이터 전체 삭제(확인 다이얼로그).
- [ ] **Step 2:** 프리셋 저장 → `listConnections` 반영, secret 평문 미저장 확인 테스트.
- [ ] **Step 3: Commit** → `git commit -m "feat: settings (presets, backup, passphrase)"`

### Task 10.4: 수동 보유 관리 (5-2)

**Files:** Create `app/holdings/page.tsx`, `components/holdings/HoldingForm.tsx`

- [ ] **Step 1:** MANUAL 보유 CRUD(connection, market, name, symbol, sector, currency, quantity, avgBuyPrice). 저장 직후 1회 갱신 트리거(symbol을 시세 대상에 포함). 토스 connection 없으면 `manualPrice` 입력란 노출.
- [ ] **Step 2:** 폼 제출 → `upsertManualHolding` 호출 + 저장 후 refresh 트리거 테스트.
- [ ] **Step 3: Commit** → `git commit -m "feat: manual holdings management"`

### Task 10.5: 포트폴리오 메인 (5-1)

**Files:** Create `app/page.tsx`, `components/portfolio/{SummaryHero,SectorDonut,HoldingsTable,RefreshBar}.tsx`

- [ ] **Step 1:** 요약 히어로 카드(총평가금 number-hero + 총수익률 배지 + 일간손익). 섹터 도넛(DESIGN.md `donut-chart` palette). 종목 테이블(시장/증권사/종목/수량/매수가/현재가/평가금/수익률, USD 원통화 병기). 갱신 버튼 + 마지막 갱신 시각. 빈 상태 카피("아직 보유 종목이 없어요. 토스를 연동하거나 직접 추가해 보세요."). 도넛 차트는 의존성 추가(`recharts` 등) 또는 SVG 직접 — 외부 CDN 금지 환경 아님(앱은 일반 웹).
- [ ] **Step 2:** `usePortfolio` 뷰모델로 렌더, 갱신 버튼 → `useRefresh` 호출 테스트(목킹).
- [ ] **Step 3:** 앱 진입 시 `lastSnapshotDate != 오늘`이면 refresh 후 `saveDailySnapshotIfNeeded` 호출(스펙 §4-3).
- [ ] **Step 4: Commit** → `git commit -m "feat: portfolio main screen"`

---

## Phase 11: PWA

### Task 11.1: manifest + service worker

**Files:** Create `public/manifest.webmanifest`, `public/icons/*`, service worker(`next-pwa` 또는 수동 `public/sw.js` + 등록)

- [ ] **Step 1:** manifest(name, icons, theme_color `#3182F6`, background `#F2F4F6`, display standalone). 셀프호스팅 Pretendard precache. safe-area-inset 패딩(DESIGN.md Layout).
- [ ] **Step 2:** 빌드 후 Lighthouse PWA 항목 확인(설치 가능). Run: `pnpm build && pnpm start` 후 점검.
- [ ] **Step 3: Commit** → `git commit -m "feat: PWA manifest + service worker"`

---

## Phase 12: 에러 처리 마감 + 최종 검증

### Task 12.1: 에러 처리 일관화 (스펙 §6)

**Files:** Modify 해당 모듈 — 401 재발급 1회 재시도, 429 백오프, 부분 실패 배너, API 다운 시 마지막 캐시 표시 + 경고 배너, 환율 실패 시 직전 fxRate, 자격증명/패스프레이즈/JSON 오류 메시지(§4-4 긍정형).

- [ ] **Step 1:** 각 에러 경로 테스트 추가(목킹) — 401→재시도, 429→백오프, 부분 실패 격리, 환율 폴백.
- [ ] **Step 2:** 통과 확인.
- [ ] **Step 3: Commit** → `git commit -m "feat: consistent error handling per spec §6"`

### Task 12.2: 최종 검증

> REQUIRED SUB-SKILL: superpowers:verification-before-completion — 주장 전에 명령 실행·출력 확인.

- [ ] **Step 1:** `pnpm test` → 전체 통과 출력 확인.
- [ ] **Step 2:** `pnpm typecheck` → 오류 0.
- [ ] **Step 3:** `pnpm build` → 빌드 성공.
- [ ] **Step 4:** `pnpm lint` → 통과.
- [ ] **Step 5:** 수동 스모크 — 잠금 설정 → 프리셋 추가 → 수동 종목 추가 → 갱신 → 포트폴리오 표시 → JSON 내보내기/불러오기 라운드트립.
- [ ] **Step 6:** REQUIRED SUB-SKILL: superpowers:requesting-code-review — 머지 전 코드 리뷰 요청.

---

## 테스트 커버리지 매핑 (스펙 §7 대응)

| 스펙 요구 | 태스크 |
|---|---|
| `portfolio-service` 병합·매핑·환산·비율·일간손익 | 6.1~6.5 |
| `toss-proxy` 토큰/401/429/부분실패/무저장 | 3.1, 3.2, 12.1 |
| `crypto` 라운드트립 + 오답 거부 | 2.1 |
| `backup` 라운드트립 + 검증 | 8.1 |
| `snapshot-service` 하루 1건 | 7.1 |
| `local-store` IndexedDB CRUD | 1.3 |

---

## 위험 & 후속

- **토스 API 실제 스키마**: `toss-client.ts`가 정규화를 캡슐화하므로 경로/필드 변경 시 한 곳만 수정. 구현 착수 시 토스 Open API 문서로 엔드포인트·필드명·rate limit 실측(스펙 §8).
- **prevClose 이월 한계**: 앱을 며칠 안 열면 prevClose 신선도 저하 → 후속에서 `/candles` 보강 검토.
- **sector-map 시드 빈약**: "미분류" 폴백으로 동작하되, 운영하며 override 누적.
- **B 대시보드 연계**: `dailySnapshot`이 공급원. snapshot 스키마는 B가 위에 쌓일 것을 고려해 유지(스펙 §0).
