import { describe, it, expect } from "vitest";
import { mergeHoldings } from "@/lib/portfolio/merge";
import type { Holding } from "@/lib/types";

function h(over: Partial<Holding>): Holding {
  return {
    id: "h",
    connectionId: "c1",
    market: "KOSPI",
    symbol: "005930",
    name: "삼성전자",
    sector: "반도체",
    currency: "KRW",
    quantity: 1,
    avgBuyPrice: 1000,
    source: "AUTO",
    updatedAt: 1,
    ...over,
  };
}

describe("mergeHoldings", () => {
  it("keeps the same symbol held in two connections as two rows", () => {
    const rows = mergeHoldings([
      h({ id: "a", connectionId: "c1", symbol: "005930" }),
      h({ id: "b", connectionId: "c2", symbol: "005930" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("sorts deterministically regardless of input order", () => {
    const input = [
      h({ id: "1", market: "NASDAQ", symbol: "AAPL", connectionId: "c2" }),
      h({ id: "2", market: "KOSPI", symbol: "005930", connectionId: "c2" }),
      h({ id: "3", market: "KOSPI", symbol: "005930", connectionId: "c1" }),
      h({ id: "4", market: "KOSPI", symbol: "000660", connectionId: "c1" }),
    ];
    const order = (hs: Holding[]) => hs.map((x) => x.id);
    const a = order(mergeHoldings(input));
    const b = order(mergeHoldings([...input].reverse()));
    expect(a).toEqual(b);
    // sorted by market, then symbol, then connectionId
    expect(a).toEqual(["4", "3", "2", "1"]);
  });

  it("returns [] for empty input", () => {
    expect(mergeHoldings([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [
      h({ id: "1", symbol: "B" }),
      h({ id: "2", symbol: "A" }),
    ];
    const snapshot = input.map((x) => x.id);
    mergeHoldings(input);
    expect(input.map((x) => x.id)).toEqual(snapshot);
  });
});
