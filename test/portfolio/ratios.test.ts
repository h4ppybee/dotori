import { describe, it, expect } from "vitest";
import { bySector, byHolding } from "@/lib/portfolio/ratios";

describe("bySector", () => {
  it("groups by sector, sums valueKrw, computes pct, sorts desc", () => {
    const out = bySector([
      { sector: "반도체", valueKrw: 300 },
      { sector: "반도체", valueKrw: 100 },
      { sector: "미분류", valueKrw: 100 },
    ]);
    expect(out).toEqual([
      { sector: "반도체", valueKrw: 400, pct: 80 },
      { sector: "미분류", valueKrw: 100, pct: 20 },
    ]);
  });

  it("includes 미분류 like any other sector", () => {
    const out = bySector([{ sector: "미분류", valueKrw: 50 }]);
    expect(out).toEqual([{ sector: "미분류", valueKrw: 50, pct: 100 }]);
  });

  it("pcts sum to ~100", () => {
    const out = bySector([
      { sector: "A", valueKrw: 1 },
      { sector: "B", valueKrw: 2 },
      { sector: "C", valueKrw: 3 },
    ]);
    const sum = out.reduce((s, r) => s + r.pct, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("returns [] for empty input", () => {
    expect(bySector([])).toEqual([]);
  });

  it("pct is 0 when total is 0", () => {
    const out = bySector([{ sector: "A", valueKrw: 0 }]);
    expect(out).toEqual([{ sector: "A", valueKrw: 0, pct: 0 }]);
  });
});

describe("byHolding", () => {
  it("computes pct of total and sorts desc", () => {
    const out = byHolding([
      { symbol: "005930", name: "삼성전자", valueKrw: 720000 },
      { symbol: "AAPL", name: "Apple", valueKrw: 432000 },
    ]);
    expect(out[0].symbol).toBe("005930");
    expect(out[0].pct).toBeCloseTo(62.5, 6);
    expect(out[1].pct).toBeCloseTo(37.5, 6);
    expect(out.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 6);
  });

  it("같은 symbol은 한 행으로 합산한다", () => {
    const out = byHolding([
      { symbol: "000660", name: "SK하이닉스", valueKrw: 300000 },
      { symbol: "005930", name: "삼성전자", valueKrw: 400000 },
      { symbol: "000660", name: "SK하이닉스", valueKrw: 100000 },
    ]);
    expect(out).toHaveLength(2);
    const skh = out.find((r) => r.symbol === "000660");
    expect(skh?.valueKrw).toBe(400000);
    expect(skh?.pct).toBeCloseTo(50, 6);
  });

  it("returns [] for empty input", () => {
    expect(byHolding([])).toEqual([]);
  });
});
