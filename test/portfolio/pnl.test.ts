import { describe, it, expect } from "vitest";
import {
  holdingValue,
  holdingCost,
  holdingPnl,
  returnPct,
  dailyPnl,
} from "@/lib/portfolio/pnl";

describe("pnl helpers", () => {
  it("holdingValue = quantity * price", () => {
    expect(holdingValue({ quantity: 10, price: 72000 })).toBe(720000);
  });

  it("holdingCost = quantity * avgBuyPrice", () => {
    expect(holdingCost({ quantity: 10, avgBuyPrice: 70000 })).toBe(700000);
  });

  it("holdingPnl = (price - avgBuyPrice) * quantity", () => {
    expect(holdingPnl({ quantity: 10, price: 72000, avgBuyPrice: 70000 })).toBe(20000);
  });

  it("returnPct = pnl / cost * 100", () => {
    expect(returnPct({ pnl: 20000, cost: 700000 })).toBeCloseTo(2.857, 3);
  });

  it("returnPct guards against zero cost", () => {
    expect(returnPct({ pnl: 100, cost: 0 })).toBe(0);
  });
});

describe("dailyPnl", () => {
  it("AUTO returns tossDailyPnl", () => {
    expect(dailyPnl({ source: "AUTO", tossDailyPnl: 5000 })).toBe(5000);
  });

  it("AUTO returns undefined when tossDailyPnl is null/undefined", () => {
    expect(dailyPnl({ source: "AUTO", tossDailyPnl: null })).toBeUndefined();
    expect(dailyPnl({ source: "AUTO" })).toBeUndefined();
  });

  it("MANUAL with prevClose = (price - prevClose) * quantity", () => {
    expect(
      dailyPnl({ source: "MANUAL", price: 160, prevClose: 155, quantity: 2 }),
    ).toBe(10);
  });

  it("MANUAL with no prevClose returns undefined", () => {
    expect(
      dailyPnl({ source: "MANUAL", price: 160, quantity: 2 }),
    ).toBeUndefined();
  });
});
