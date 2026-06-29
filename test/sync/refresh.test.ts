import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db/schema";
import * as store from "@/lib/db/local-store";
import { deriveKey, encrypt, makeSalt } from "@/lib/crypto/crypto";
import { refreshAll } from "@/lib/sync/refresh";

afterEach(async () => {
  await db.delete();
  await db.open();
  vi.restoreAllMocks();
});

// UTC day boundary so toISOString().slice(0,10) is unambiguous.
const TODAY_MS = Date.parse("2026-06-25T03:00:00.000Z");
const YESTERDAY_MS = TODAY_MS - 86_400_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const SAMSUNG = {
  symbol: "005930",
  name: "삼성전자",
  market: "KOSPI",
  currency: "KRW" as const,
  quantity: 10,
  avgBuyPrice: 70000,
  dailyPnl: 5000,
};

interface RouteOverrides {
  accountsStatus?: number;
  holdings?: typeof SAMSUNG[];
  lastPrice?: number;
}

function stubFetch(overrides: RouteOverrides = {}) {
  const lastPrice = overrides.lastPrice ?? 72000;
  const holdings = overrides.holdings ?? [SAMSUNG];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/toss/token")) {
      return jsonResponse({ accessToken: "T", expiresIn: 3600 });
    }
    if (url.includes("/api/toss/accounts")) {
      if (overrides.accountsStatus && overrides.accountsStatus !== 200) {
        return new Response("err", { status: overrides.accountsStatus });
      }
      return jsonResponse({ accounts: ["A1"] });
    }
    if (url.includes("/api/toss/holdings")) {
      return jsonResponse({ holdings });
    }
    if (url.includes("/api/toss/prices")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        symbols: { symbol: string; currency: string }[];
      };
      const prices = body.symbols.map((s) => ({
        symbol: s.symbol,
        currency: s.currency,
        lastPrice,
      }));
      return jsonResponse({ prices });
    }
    if (url.includes("/api/toss/exchange-rate")) {
      return jsonResponse({ rate: 1350 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function seedTossConnection(key: CryptoKey) {
  return store.upsertConnection({
    memberId: "m1",
    type: "TOSS_API",
    label: "토스증권",
    clientId: "id",
    clientSecretEnc: await encrypt(key, "secret"),
  });
}

describe("refreshAll", () => {
  it("happy path: persists holdings, prices, fx and builds the vm", async () => {
    const key = await deriveKey("pp", makeSalt());
    await seedTossConnection(key);
    stubFetch();

    const { vm, failures } = await refreshAll({ key, now: TODAY_MS });

    const holdings = await store.listHoldings();
    const auto = holdings.find((h) => h.symbol === "005930" && h.source === "AUTO");
    expect(auto).toBeTruthy();
    expect(auto?.tossDailyPnl).toBe(5000);

    const price = await store.getPrice("005930", "KRW");
    expect(price?.lastPrice).toBe(72000);

    const fx = await store.getFx();
    expect(fx?.rate).toBe(1350);

    expect(vm.totalValueKrw).toBe(720000);
    expect(failures).toHaveLength(0);
  });

  it("persists discovered accountSeqs back onto the connection", async () => {
    const key = await deriveKey("pp", makeSalt());
    const conn = await seedTossConnection(key);
    stubFetch();

    await refreshAll({ key, now: TODAY_MS });

    const reloaded = (await store.listConnections()).find((c) => c.id === conn.id);
    expect(reloaded?.accountSeqs).toEqual(["A1"]);
  });

  it("carries forward prevClose when the cached price is from an earlier day", async () => {
    const key = await deriveKey("pp", makeSalt());
    await seedTossConnection(key);
    await store.putPrice({ symbol: "005930", currency: "KRW", lastPrice: 71000, asOf: YESTERDAY_MS });
    stubFetch();

    await refreshAll({ key, now: TODAY_MS });

    const price = await store.getPrice("005930", "KRW");
    expect(price?.lastPrice).toBe(72000);
    expect(price?.prevClose).toBe(71000);
  });

  it("isolates a per-connection failure and still values manual holdings", async () => {
    const key = await deriveKey("pp", makeSalt());
    const conn = await seedTossConnection(key);
    await store.upsertManualHolding({
      connectionId: "manual1",
      market: "KOSPI",
      symbol: "000660",
      name: "SK하이닉스",
      sector: "미분류",
      currency: "KRW",
      quantity: 5,
      avgBuyPrice: 100000,
      manualPrice: 120000,
    });
    stubFetch({ accountsStatus: 500 });

    const { vm, failures } = await refreshAll({ key, now: TODAY_MS });

    expect(failures).toHaveLength(1);
    expect(failures[0].connectionId).toBe(conn.id);

    const manualRow = vm.rows.find((r) => r.holding.symbol === "000660");
    expect(manualRow).toBeTruthy();
    expect(manualRow?.valueKrw).toBe(600000); // 5 * 120000
  });

  it("prunes an AUTO holding that disappears from the toss response", async () => {
    const key = await deriveKey("pp", makeSalt());
    const conn = await seedTossConnection(key);
    // 이전 동기화에서 들어온 AUTO 행(이번 응답엔 없음 → 매도된 것으로 간주).
    await store.upsertAutoHolding({ connectionId: conn.id, market: "KOSPI", symbol: "000660",
      name: "SK하이닉스", currency: "KRW", quantity: 5, avgBuyPrice: 100000, sector: "미분류" });
    stubFetch(); // holdings = [삼성전자]만 반환

    await refreshAll({ key, now: TODAY_MS });

    const holdings = await store.listHoldings();
    const symbols = holdings.map((h) => h.symbol).sort();
    expect(symbols).toEqual(["005930"]); // 000660은 정리됨
  });

  it("does not prune when the connection sync fails (catch path)", async () => {
    const key = await deriveKey("pp", makeSalt());
    const conn = await seedTossConnection(key);
    await store.upsertAutoHolding({ connectionId: conn.id, market: "KOSPI", symbol: "000660",
      name: "SK하이닉스", currency: "KRW", quantity: 5, avgBuyPrice: 100000, sector: "미분류" });
    stubFetch({ accountsStatus: 500 });

    await refreshAll({ key, now: TODAY_MS });

    const holdings = await store.listHoldings();
    expect(holdings.find((h) => h.symbol === "000660")).toBeTruthy(); // 보존됨
  });

  it("keeps prevClose stable across two refreshes on the same day", async () => {
    const key = await deriveKey("pp", makeSalt());
    await seedTossConnection(key);
    await store.putPrice({ symbol: "005930", currency: "KRW", lastPrice: 71000, asOf: YESTERDAY_MS });

    stubFetch({ lastPrice: 72000 });
    await refreshAll({ key, now: TODAY_MS });
    expect((await store.getPrice("005930", "KRW"))?.prevClose).toBe(71000);

    // 같은 날 다른 lastPrice로 다시 갱신해도 prevClose는 71000으로 유지.
    vi.restoreAllMocks();
    stubFetch({ lastPrice: 73000 });
    await refreshAll({ key, now: TODAY_MS + 3_600_000 });

    const price = await store.getPrice("005930", "KRW");
    expect(price?.lastPrice).toBe(73000);
    expect(price?.prevClose).toBe(71000);
  });

  it("skips the prices fetch entirely for a manual-only setup", async () => {
    const key = await deriveKey("pp", makeSalt());
    // TOSS connection 없음. MANUAL 종목만 존재.
    await store.upsertManualHolding({
      connectionId: "manual1",
      market: "KOSPI",
      symbol: "000660",
      name: "SK하이닉스",
      sector: "미분류",
      currency: "KRW",
      quantity: 5,
      avgBuyPrice: 100000,
      manualPrice: 120000,
    });
    const fetchMock = stubFetch();

    const { vm, failures } = await refreshAll({ key, now: TODAY_MS });

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/api/toss/prices"))).toBe(false);
    expect(failures).toHaveLength(0);

    const manualRow = vm.rows.find((r) => r.holding.symbol === "000660");
    expect(manualRow?.valueKrw).toBe(600000); // 5 * 120000
  });

  it("dedups {symbol,currency} in the prices payload when two connections hold the same symbol", async () => {
    const key = await deriveKey("pp", makeSalt());
    await seedTossConnection(key);
    await seedTossConnection(key); // 두 번째 TOSS connection도 005930 보유
    const fetchMock = stubFetch();

    await refreshAll({ key, now: TODAY_MS });

    const pricesCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/toss/prices"));
    expect(pricesCall).toBeTruthy();
    const body = JSON.parse(String((pricesCall![1] as RequestInit).body)) as {
      symbols: { symbol: string; currency: string }[];
    };
    expect(body.symbols).toEqual([{ symbol: "005930", currency: "KRW" }]);
  });
});

// ─── Item 3: 401 → token re-issue + single retry ──────────────────────────────

describe("refreshAll 401 retry", () => {
  it("re-issues token and retries holdings when holdings proxy returns 401 on first call", async () => {
    const key = await deriveKey("pp", makeSalt());
    const conn = await seedTossConnection(key);

    let holdingsCallCount = 0;
    let tokenCallCount = 0;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/toss/token")) {
        tokenCallCount += 1;
        return jsonResponse({ accessToken: `T${tokenCallCount}`, expiresIn: 3600 });
      }
      if (url.includes("/api/toss/accounts")) {
        return jsonResponse({ accounts: ["A1"] });
      }
      if (url.includes("/api/toss/holdings")) {
        holdingsCallCount += 1;
        if (holdingsCallCount === 1) {
          // 첫 번째 holdings 호출 → 401 (토큰 서버측 무효화 시뮬레이션)
          return new Response("unauthorized", { status: 401 });
        }
        return jsonResponse({ holdings: [SAMSUNG] });
      }
      if (url.includes("/api/toss/prices")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          symbols: { symbol: string; currency: string }[];
        };
        const prices = body.symbols.map((s) => ({
          symbol: s.symbol,
          currency: s.currency,
          lastPrice: 72000,
        }));
        return jsonResponse({ prices });
      }
      if (url.includes("/api/toss/exchange-rate")) {
        return jsonResponse({ rate: 1350 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { failures } = await refreshAll({ key, now: TODAY_MS });

    // 실패 없이 완료됐어야 함
    expect(failures).toHaveLength(0);

    // holdings가 실제 upsert됐어야 함
    const holdings = await store.listHoldings();
    const auto = holdings.find((h) => h.symbol === "005930" && h.source === "AUTO");
    expect(auto).toBeTruthy();

    // 토큰 재발급이 최소 2회 일어났어야 함 (초기 발급 + 401 후 재발급)
    expect(tokenCallCount).toBeGreaterThanOrEqual(2);

    // tokenCache가 무효화된 후 새 값으로 교체됐어야 함
    const cached = await db.tokenCache.get(conn.id);
    expect(cached).toBeTruthy();
  });

  it("re-issues token and retries accounts when accounts proxy returns 401 on first call", async () => {
    const key = await deriveKey("pp", makeSalt());
    const conn = await seedTossConnection(key);

    let accountsCallCount = 0;
    let tokenCallCount = 0;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/toss/token")) {
        tokenCallCount += 1;
        return jsonResponse({ accessToken: `T${tokenCallCount}`, expiresIn: 3600 });
      }
      if (url.includes("/api/toss/accounts")) {
        accountsCallCount += 1;
        if (accountsCallCount === 1) {
          // 첫 번째 accounts 호출 → 401 (복원된 죽은 토큰 시뮬레이션)
          return new Response("unauthorized", { status: 401 });
        }
        return jsonResponse({ accounts: ["A1"] });
      }
      if (url.includes("/api/toss/holdings")) {
        return jsonResponse({ holdings: [SAMSUNG] });
      }
      if (url.includes("/api/toss/prices")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          symbols: { symbol: string; currency: string }[];
        };
        const prices = body.symbols.map((s) => ({ symbol: s.symbol, currency: s.currency, lastPrice: 72000 }));
        return jsonResponse({ prices });
      }
      if (url.includes("/api/toss/exchange-rate")) {
        return jsonResponse({ rate: 1350 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { failures } = await refreshAll({ key, now: TODAY_MS });

    // 실패 없이 완료됐어야 함 (401 후 토큰 재발급 + 재시도 성공)
    expect(failures).toHaveLength(0);

    // holdings가 실제 upsert됐어야 함 → accounts가 결국 성공했다는 증거
    const holdings = await store.listHoldings();
    expect(holdings.find((h) => h.symbol === "005930" && h.source === "AUTO")).toBeTruthy();

    // 토큰 재발급이 최소 2회 (초기 발급 + 401 후 재발급)
    expect(tokenCallCount).toBeGreaterThanOrEqual(2);
    expect(accountsCallCount).toBe(2);

    const reloaded = (await store.listConnections()).find((c) => c.id === conn.id);
    expect(reloaded?.accountSeqs).toEqual(["A1"]);
  });

  it("records connection failure when holdings returns 401 on both first and retry", async () => {
    const key = await deriveKey("pp", makeSalt());
    const conn = await seedTossConnection(key);

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/toss/token")) {
        return jsonResponse({ accessToken: "T1", expiresIn: 3600 });
      }
      if (url.includes("/api/toss/accounts")) {
        return jsonResponse({ accounts: ["A1"] });
      }
      if (url.includes("/api/toss/holdings")) {
        // 항상 401 반환
        return new Response("unauthorized", { status: 401 });
      }
      if (url.includes("/api/toss/prices")) {
        return jsonResponse({ prices: [] });
      }
      if (url.includes("/api/toss/exchange-rate")) {
        return jsonResponse({ rate: 1350 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { failures } = await refreshAll({ key, now: TODAY_MS });

    // 재시도 후에도 실패 → connection 실패로 기록됐어야 함
    expect(failures).toHaveLength(1);
    expect(failures[0].connectionId).toBe(conn.id);
  });
});
