import { describe, it, expect } from "vitest";
import { buildPortfolio } from "@/lib/portfolio/portfolio-service";
import type { Holding, PriceCache } from "@/lib/types";

const H1: Holding = {
  source: "AUTO",
  currency: "KRW",
  symbol: "005930",
  name: "삼성전자",
  quantity: 10,
  avgBuyPrice: 70000,
  tossDailyPnl: 5000,
  connectionId: "c1",
  market: "KOSPI",
  sector: "반도체",
  id: "h1",
  updatedAt: 1,
};

const H2: Holding = {
  source: "MANUAL",
  currency: "USD",
  symbol: "AAPL",
  name: "Apple",
  quantity: 2,
  avgBuyPrice: 150,
  connectionId: "c2",
  market: "NASDAQ",
  sector: "미분류",
  id: "h2",
  updatedAt: 1,
};

const PRICES: PriceCache[] = [
  { key: "005930|KRW", symbol: "005930", currency: "KRW", lastPrice: 72000, prevClose: 71000, asOf: 1 },
  { key: "AAPL|USD", symbol: "AAPL", currency: "USD", lastPrice: 160, prevClose: 155, asOf: 1 },
];

describe("buildPortfolio — mixed AUTO(KRW) + MANUAL(USD)", () => {
  const vm = buildPortfolio({
    holdings: [H2, H1], // intentionally unordered
    prices: PRICES,
    fx: { rate: 1350 },
    sectorOverrides: {},
  });

  const row = (symbol: string) => vm.rows.find((r) => r.holding.symbol === symbol)!;

  it("H1 (삼성전자) per-row figures", () => {
    const r = row("005930");
    expect(r.valueKrw).toBeCloseTo(720000, 6);
    expect(r.costKrw).toBeCloseTo(700000, 6);
    expect(r.pnlKrw).toBeCloseTo(20000, 6);
    expect(r.returnPct).toBeCloseTo(2.857, 3);
    expect(r.dailyPnlKrw).toBeCloseTo(5000, 6);
    expect(r.sector).toBe("반도체");
  });

  it("H2 (Apple) per-row figures", () => {
    const r = row("AAPL");
    expect(r.valueKrw).toBeCloseTo(432000, 6);
    expect(r.costKrw).toBeCloseTo(405000, 6);
    expect(r.pnlKrw).toBeCloseTo(27000, 6);
    expect(r.returnPct).toBeCloseTo(6.667, 3);
    expect(r.dailyPnlKrw).toBeCloseTo(13500, 6);
    expect(r.sector).toBe("미분류");
  });

  it("totals", () => {
    expect(vm.totalCostKrw).toBeCloseTo(1105000, 6);
    expect(vm.totalValueKrw).toBeCloseTo(1152000, 6);
    expect(vm.totalPnlKrw).toBeCloseTo(47000, 6);
    expect(vm.returnPct).toBeCloseTo(4.253, 3);
    expect(vm.totalDailyPnlKrw).toBeCloseTo(18500, 6);
  });

  it("bySector with resolved sectors", () => {
    expect(vm.bySector[0]).toEqual(
      expect.objectContaining({ sector: "반도체", valueKrw: 720000 }),
    );
    expect(vm.bySector[0].pct).toBeCloseTo(62.5, 6);
    const unclassified = vm.bySector.find((s) => s.sector === "미분류")!;
    expect(unclassified.valueKrw).toBeCloseTo(432000, 6);
    expect(unclassified.pct).toBeCloseTo(37.5, 6);
    expect(vm.bySector.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 6);
  });

  it("rows ordered deterministically via mergeHoldings (KOSPI before NASDAQ)", () => {
    expect(vm.rows.map((r) => r.holding.symbol)).toEqual(["005930", "AAPL"]);
  });
});

describe("buildPortfolio — MANUAL with no prevClose and no manualPrice", () => {
  const manual: Holding = {
    source: "MANUAL",
    currency: "KRW",
    symbol: "999999",
    name: "비상장",
    quantity: 5,
    avgBuyPrice: 1000,
    connectionId: "c1",
    market: "KOSPI",
    sector: "미분류",
    id: "m1",
    updatedAt: 1,
  };
  const vm = buildPortfolio({ holdings: [manual], prices: [], sectorOverrides: {} });
  const r = vm.rows[0];

  it("falls back to avgBuyPrice so value == cost and pnl == 0", () => {
    expect(r.priceKrw).toBe(1000);
    expect(r.valueKrw).toBe(5000);
    expect(r.costKrw).toBe(5000);
    expect(r.pnlKrw).toBe(0);
    expect(r.returnPct).toBe(0);
  });

  it("dailyPnlKrw is undefined", () => {
    expect(r.dailyPnlKrw).toBeUndefined();
  });

  it("totalDailyPnlKrw is undefined when no row has a daily pnl", () => {
    expect(vm.totalDailyPnlKrw).toBeUndefined();
  });
});

describe("buildPortfolio — KRW-only with no fx provided does not throw", () => {
  it("builds without fx", () => {
    expect(() =>
      buildPortfolio({ holdings: [H1], prices: PRICES, sectorOverrides: {} }),
    ).not.toThrow();
    const vm = buildPortfolio({ holdings: [H1], prices: PRICES, sectorOverrides: {} });
    expect(vm.rows[0].valueKrw).toBe(720000);
  });
});
