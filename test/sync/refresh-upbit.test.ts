import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as store from "@/lib/db/local-store";
import * as crypto from "@/lib/crypto/crypto";
import type { Connection } from "@/lib/types";
import { refreshUpbit } from "@/lib/sync/refresh-upbit";

// refreshUpbit는 순수 정규화(@/lib/upbit/normalize)를 실제로 사용하므로 정규화는 목킹하지 않는다.
// fetch는 프록시 URL(/api/upbit<path>)로 나가므로 path 접미사로 분기해 목 응답을 돌려준다.
// local-store CRUD와 decrypt만 spy로 대체·검증한다.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const KEY = {} as CryptoKey;

function makeConn(over: Partial<Connection> = {}): Connection {
  return {
    id: "c1",
    memberId: "m1",
    type: "UPBIT_API",
    label: "업비트",
    clientId: "ACCESS",
    clientSecretEnc: "ENC",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as Connection;
}

// 업비트 /accounts 원시 응답 행.
const ACCOUNTS_BTC_ETH_KRW = [
  { currency: "BTC", balance: "0.5", locked: "0", avg_buy_price: "40000000", unit_currency: "KRW" },
  { currency: "ETH", balance: "2", locked: "0", avg_buy_price: "3000000", unit_currency: "KRW" },
  { currency: "KRW", balance: "150000", locked: "0", avg_buy_price: "0", unit_currency: "KRW" },
];

interface FetchOverrides {
  accountsStatus?: number;
  tickersStatus?: number;
  accounts?: unknown[];
}

function stubFetch(over: FetchOverrides = {}) {
  const accounts = over.accounts ?? ACCOUNTS_BTC_ETH_KRW;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/markets")) {
      return jsonResponse({ names: { "KRW-BTC": "비트코인", "KRW-ETH": "이더리움" } });
    }
    if (url.includes("/accounts")) {
      if (over.accountsStatus && over.accountsStatus !== 200) {
        return new Response("err", { status: over.accountsStatus });
      }
      return jsonResponse({ rows: accounts });
    }
    if (url.includes("/tickers")) {
      if (over.tickersStatus && over.tickersStatus !== 200) {
        return new Response("err", { status: over.tickersStatus });
      }
      return jsonResponse({ prices: { "KRW-BTC": 42000000, "KRW-ETH": 3100000 } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type CoinArg = Parameters<typeof store.upsertAutoCoin>[0];

let upsertAutoCoin: ReturnType<typeof vi.fn>;
let pruneAutoCoins: ReturnType<typeof vi.fn>;
let upsertAutoSavings: ReturnType<typeof vi.fn>;
let pruneAutoSavings: ReturnType<typeof vi.fn>;

const coinArgs = (): CoinArg[] => upsertAutoCoin.mock.calls.map((c) => c[0] as CoinArg);

function spyStore(conns: Connection[]) {
  vi.spyOn(store, "listConnections").mockResolvedValue(conns);
  upsertAutoCoin = vi.spyOn(store, "upsertAutoCoin").mockResolvedValue(undefined);
  pruneAutoCoins = vi.spyOn(store, "pruneAutoCoins").mockResolvedValue(undefined);
  upsertAutoSavings = vi.spyOn(store, "upsertAutoSavings").mockResolvedValue(undefined);
  pruneAutoSavings = vi.spyOn(store, "pruneAutoSavings").mockResolvedValue(undefined);
}

beforeEach(() => {
  // clientSecretEnc → secretKey. 실제 복호화는 하지 않는다.
  vi.spyOn(crypto, "decrypt").mockResolvedValue("SECRET");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("refreshUpbit", () => {
  it("코인 2개 + KRW 예수금: upsertAutoCoin 2회, upsertAutoSavings 1회, prune(markets) 호출", async () => {
    spyStore([makeConn()]);
    stubFetch();

    const { updated, failures } = await refreshUpbit({ key: KEY });

    expect(updated).toBe(1);
    expect(failures).toHaveLength(0);

    expect(upsertAutoCoin).toHaveBeenCalledTimes(2);
    const markets = coinArgs().map((c) => c.market).sort();
    expect(markets).toEqual(["KRW-BTC", "KRW-ETH"]);

    const btc = coinArgs().find((c) => c.market === "KRW-BTC")!;
    expect(btc.name).toBe("비트코인");
    expect(btc.quantity).toBe(0.5);
    expect(btc.buyPrice).toBe(40000000);
    expect(btc.currentPrice).toBe(42000000);

    expect(upsertAutoSavings).toHaveBeenCalledTimes(1);
    expect(upsertAutoSavings).toHaveBeenCalledWith({ connectionId: "c1", amount: 150000 });

    expect(pruneAutoSavings).not.toHaveBeenCalled();
    expect(pruneAutoCoins).toHaveBeenCalledWith("c1", expect.arrayContaining(["KRW-BTC", "KRW-ETH"]));
  });

  it("예수금 없음: pruneAutoSavings 호출", async () => {
    spyStore([makeConn()]);
    stubFetch({
      accounts: [
        { currency: "BTC", balance: "0.5", locked: "0", avg_buy_price: "40000000", unit_currency: "KRW" },
      ],
    });

    await refreshUpbit({ key: KEY });

    expect(upsertAutoSavings).not.toHaveBeenCalled();
    expect(pruneAutoSavings).toHaveBeenCalledWith("c1");
  });

  it("/accounts 실패: failures에 기록, prune 미호출(보유 보존)", async () => {
    spyStore([makeConn()]);
    stubFetch({ accountsStatus: 401 });

    const { updated, failures } = await refreshUpbit({ key: KEY });

    expect(updated).toBe(0);
    expect(failures).toHaveLength(1);
    expect(failures[0].connectionId).toBe("c1");
    expect(failures[0].label).toBe("업비트");

    expect(upsertAutoCoin).not.toHaveBeenCalled();
    expect(pruneAutoCoins).not.toHaveBeenCalled();
    expect(pruneAutoSavings).not.toHaveBeenCalled();
    expect(upsertAutoSavings).not.toHaveBeenCalled();
  });

  it("/tickers 실패: 코인은 여전히 upsert(currentPrice undefined), prune 정상 수행", async () => {
    spyStore([makeConn()]);
    stubFetch({ tickersStatus: 500 });

    const { updated, failures } = await refreshUpbit({ key: KEY });

    expect(updated).toBe(1);
    expect(failures).toHaveLength(0);

    expect(upsertAutoCoin).toHaveBeenCalledTimes(2);
    const btc = coinArgs().find((c) => c.market === "KRW-BTC")!;
    expect(btc.currentPrice).toBeUndefined();

    expect(pruneAutoCoins).toHaveBeenCalledWith("c1", expect.arrayContaining(["KRW-BTC", "KRW-ETH"]));
    expect(upsertAutoSavings).toHaveBeenCalledWith({ connectionId: "c1", amount: 150000 });
  });

  it("TOSS_API 연결은 무시한다", async () => {
    spyStore([makeConn({ id: "toss1", type: "TOSS_API", label: "토스" })]);
    const fetchMock = stubFetch();

    const { updated, failures } = await refreshUpbit({ key: KEY });

    expect(updated).toBe(0);
    expect(failures).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertAutoCoin).not.toHaveBeenCalled();
  });
});
