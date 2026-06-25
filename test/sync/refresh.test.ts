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

interface RouteOverrides {
  accountsStatus?: number;
}

function stubFetch(overrides: RouteOverrides = {}) {
  const fetchMock = vi.fn(async (url: string) => {
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
      return jsonResponse({
        holdings: [
          {
            symbol: "005930",
            name: "삼성전자",
            market: "KOSPI",
            currency: "KRW",
            quantity: 10,
            avgBuyPrice: 70000,
            dailyPnl: 5000,
          },
        ],
      });
    }
    if (url.includes("/api/toss/prices")) {
      return jsonResponse({ prices: [{ symbol: "005930", currency: "KRW", lastPrice: 72000 }] });
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
});
