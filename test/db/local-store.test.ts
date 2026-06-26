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

  it("prunes AUTO holdings not in keepSymbols (keeps the rest)", async () => {
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "005930",
      name: "삼성전자", currency: "KRW", quantity: 10, avgBuyPrice: 70000, sector: "반도체" });
    await store.upsertAutoHolding({ connectionId: "c1", market: "KOSPI", symbol: "000660",
      name: "SK하이닉스", currency: "KRW", quantity: 5, avgBuyPrice: 100000, sector: "반도체" });
    // 다른 connection의 AUTO 행은 영향받지 않아야 한다.
    await store.upsertAutoHolding({ connectionId: "c2", market: "KOSPI", symbol: "035720",
      name: "카카오", currency: "KRW", quantity: 3, avgBuyPrice: 50000, sector: "IT" });
    // MANUAL 행도 영향받지 않아야 한다.
    await store.upsertManualHolding({ connectionId: "c1", market: "KOSPI", symbol: "068270",
      name: "셀트리온", sector: "바이오", currency: "KRW", quantity: 2, avgBuyPrice: 180000 });

    await store.pruneAutoHoldings("c1", ["005930"]);

    const holdings = await store.listHoldings();
    const symbols = holdings.map((h) => `${h.connectionId}:${h.symbol}:${h.source}`).sort();
    expect(symbols).toEqual(["c1:005930:AUTO", "c1:068270:MANUAL", "c2:035720:AUTO"]);
  });

  it("reads sector overrides as a map", async () => {
    await store.putSectorOverride("005930", "전자");
    expect(await store.getSectorOverrides()).toEqual({ "005930": "전자" });
  });
});
