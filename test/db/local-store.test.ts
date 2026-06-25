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

  it("reads sector overrides as a map", async () => {
    await store.putSectorOverride("005930", "전자");
    expect(await store.getSectorOverrides()).toEqual({ "005930": "전자" });
  });
});
