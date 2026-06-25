import { describe, it, expect, vi, beforeEach } from "vitest";

describe("toss token proxy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("exchanges token and returns it without persisting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: "TKN", expires_in: 3600 }), { status: 200 }),
      ),
    );
    const { POST } = await import("@/app/api/toss/token/route");
    const req = new Request("http://x/api/toss/token", {
      method: "POST",
      body: JSON.stringify({ clientId: "id", clientSecret: "sec" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.accessToken).toBe("TKN");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const mod = await import("@/app/api/toss/token/route");
    expect(Object.keys(mod).filter((k) => /store|cache|db|persist/i.test(k))).toEqual([]);
  });

  it("propagates 401 with structured error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const { POST } = await import("@/app/api/toss/token/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ clientId: "a", clientSecret: "b" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("toss accounts proxy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns accounts list with no-store header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ result: [{ accountSeq: "ACC1" }, { accountSeq: "ACC2" }] }), {
          status: 200,
        }),
      ),
    );
    const { POST } = await import("@/app/api/toss/accounts/route");
    const req = new Request("http://x/api/toss/accounts", {
      method: "POST",
      body: JSON.stringify({ token: "TKN" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.accounts).toEqual(["ACC1", "ACC2"]);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("propagates 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauth", { status: 401 })));
    const { POST } = await import("@/app/api/toss/accounts/route");
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ token: "T" }) }),
    );
    expect(res.status).toBe(401);
  });
});

describe("toss holdings proxy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns holdings with no-store header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            result: [
              {
                symbol: "005930",
                name: "삼성전자",
                market: "KOSPI",
                currency: "KRW",
                quantity: 5,
                avgPrice: 60000,
                dailyProfitLoss: 500,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const { POST } = await import("@/app/api/toss/holdings/route");
    const req = new Request("http://x/api/toss/holdings", {
      method: "POST",
      body: JSON.stringify({ token: "TKN", accountSeq: "ACC1" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.holdings[0]).toMatchObject({ symbol: "005930", quantity: 5, avgBuyPrice: 60000 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("toss prices proxy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns prices with no-store header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ result: [{ symbol: "005930", currency: "KRW", price: 72000 }] }),
          { status: 200 },
        ),
      ),
    );
    const { POST } = await import("@/app/api/toss/prices/route");
    const req = new Request("http://x/api/toss/prices", {
      method: "POST",
      body: JSON.stringify({ token: "TKN", symbols: [{ symbol: "005930", currency: "KRW" }] }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.prices[0]).toMatchObject({ symbol: "005930", lastPrice: 72000 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("toss exchange-rate proxy", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns exchange rate with no-store header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { rate: 1350.5 } }), { status: 200 }),
      ),
    );
    const { POST } = await import("@/app/api/toss/exchange-rate/route");
    const req = new Request("http://x/api/toss/exchange-rate", {
      method: "POST",
      body: JSON.stringify({ token: "TKN" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body.rate).toBe(1350.5);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("propagates 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    const { POST } = await import("@/app/api/toss/exchange-rate/route");
    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ token: "T" }) }),
    );
    expect(res.status).toBe(429);
  });
});
