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
    expect(db.sectorOverrides).toBeDefined();
  });
  it("round-trips a holding", async () => {
    await db.holdings.put({ id: "h1", connectionId: "c1", market: "KOSPI",
      symbol: "005930", name: "삼성전자", sector: "반도체", currency: "KRW",
      quantity: 10, avgBuyPrice: 70000, source: "MANUAL", updatedAt: 1 });
    const got = await db.holdings.get("h1");
    expect(got?.name).toBe("삼성전자");
  });
  it("exposes assetSnapshots store (v7)", async () => {
    expect(db.assetSnapshots).toBeDefined();
    await db.assetSnapshots.put({
      id: "s1", createdAt: 1000, netWorthKrw: 900, totalAssetsKrw: 1000, totalDebtKrw: 100,
      stocks: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
      pension: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
      coin: { totalValueKrw: 0, totalCostKrw: 0, totalPnlKrw: 0, returnPct: 0, rows: [] },
      savings: { totalKrw: 0, rows: [] },
      debt: { totalKrw: 100, rows: [{ name: "대출", amountKrw: 100 }] },
    });
    const got = await db.assetSnapshots.get("s1");
    expect(got?.netWorthKrw).toBe(900);
  });
});
