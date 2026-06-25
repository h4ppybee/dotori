import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeHoldings, normalizePrices, normalizeAccounts, TossError } from "@/lib/toss/toss-client";

afterEach(() => {
  vi.restoreAllMocks();
});

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

// ─── Item 2: NaN/shape guard ──────────────────────────────────────────────────

describe("normalizeHoldings NaN guard", () => {
  it("excludes a holding row with missing quantity (NaN)", () => {
    const raw = {
      result: [
        // 정상 행
        { symbol: "005930", name: "삼성전자", market: "KOSPI", currency: "KRW",
          quantity: 10, avgPrice: 70000 },
        // 비정상 행 — quantity 없음
        { symbol: "000660", name: "SK하이닉스", market: "KOSPI", currency: "KRW",
          quantity: null, avgPrice: 100000 },
      ],
    };
    const out = normalizeHoldings(raw);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("005930");
  });

  it("excludes a holding row with missing avgPrice (NaN)", () => {
    const raw = {
      result: [
        { symbol: "005930", name: "삼성전자", market: "KOSPI", currency: "KRW",
          quantity: 10, avgPrice: 70000 },
        { symbol: "000660", name: "SK하이닉스", market: "KOSPI", currency: "KRW",
          quantity: 5, avgPrice: undefined },
      ],
    };
    const out = normalizeHoldings(raw);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("005930");
  });

  it("excludes a holding row with unknown currency", () => {
    const raw = {
      result: [
        { symbol: "005930", name: "삼성전자", market: "KOSPI", currency: "KRW",
          quantity: 10, avgPrice: 70000 },
        { symbol: "TSLA", name: "Tesla", market: "NASDAQ", currency: "EUR",
          quantity: 2, avgPrice: 250 },
      ],
    };
    const out = normalizeHoldings(raw);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("005930");
  });
});

describe("normalizePrices NaN guard", () => {
  it("excludes a price row with NaN price", () => {
    const raw = {
      result: [
        { symbol: "005930", currency: "KRW", price: 72000 },
        { symbol: "000660", currency: "KRW", price: null },
      ],
    };
    const out = normalizePrices(raw);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("005930");
  });

  it("excludes a price row with unknown currency", () => {
    const raw = {
      result: [
        { symbol: "005930", currency: "KRW", price: 72000 },
        { symbol: "TSLA", currency: "JPY", price: 300 },
      ],
    };
    const out = normalizePrices(raw);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("005930");
  });
});

// ─── Item 1: 429 backoff retry ────────────────────────────────────────────────

describe("tossGet 429 backoff retry", () => {
  it("retries once after 429 and resolves with 200 body, calling fetch twice", async () => {
    // exchangeToken을 통해 429 → 재시도 동작을 검증
    // exchangeToken은 /api/v2/oauth/token POST
    const { exchangeToken, setSleep } = await import("@/lib/toss/toss-client");
    // 테스트에서 sleep을 즉시 반환하도록 주입
    setSleep(() => Promise.resolve());

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response(
        JSON.stringify({ access_token: "TOK", expires_in: 3600 }),
        { status: 200 },
      );
    }));

    const result = await exchangeToken("id", "sec");
    expect(result.accessToken).toBe("TOK");
    expect(callCount).toBe(2);
  });

  it("throws TossError(429) when fetch returns 429 twice", async () => {
    const { exchangeToken, setSleep } = await import("@/lib/toss/toss-client");
    setSleep(() => Promise.resolve());

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("rate limited", { status: 429 }),
    ));

    await expect(exchangeToken("id", "sec")).rejects.toSatisfy(
      (e: unknown) => e instanceof TossError && (e as TossError).status === 429,
    );
  });

  it("respects Retry-After header delay (injected sleep receives correct ms)", async () => {
    const { exchangeToken, setSleep } = await import("@/lib/toss/toss-client");

    const sleepDelays: number[] = [];
    setSleep((ms) => {
      sleepDelays.push(ms);
      return Promise.resolve();
    });

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        });
      }
      return new Response(
        JSON.stringify({ access_token: "TOK2", expires_in: 3600 }),
        { status: 200 },
      );
    }));

    await exchangeToken("id", "sec");
    expect(sleepDelays[0]).toBe(2000); // 2초 → 2000ms
  });
});

// ─── Item 5: fetchPrices 201심볼 배치 경계 ──────────────────────────────────

describe("fetchPrices batch boundary", () => {
  it("calls fetch twice for 201 symbols (200+1) and merges results without drops or dupes", async () => {
    const { fetchPrices, setSleep } = await import("@/lib/toss/toss-client");
    setSleep(() => Promise.resolve());

    const symbols = Array.from({ length: 201 }, (_, i) => ({
      symbol: `SYM${i.toString().padStart(3, "0")}`,
      currency: "KRW",
    }));

    let fetchCallCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, _init?: RequestInit) => {
      fetchCallCount += 1;
      const url = String(_url);
      const symbolsParam = new URL(url).searchParams.get("symbols") ?? "";
      const syms = symbolsParam.split(",").filter(Boolean);
      const result = syms.map((s) => ({ symbol: s, currency: "KRW", price: 10000 }));
      return new Response(JSON.stringify({ result }), { status: 200 });
    }));

    const prices = await fetchPrices("TOKEN", symbols);

    expect(fetchCallCount).toBe(2);
    expect(prices).toHaveLength(201);
    // 중복 없음
    const symbolSet = new Set(prices.map((p) => p.symbol));
    expect(symbolSet.size).toBe(201);
  });
});
