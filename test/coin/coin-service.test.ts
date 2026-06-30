import { describe, it, expect } from "vitest";
import { buildCoinVM } from "@/lib/coin/coin-service";
import type { CoinHolding } from "@/lib/types";

function c(over: Partial<CoinHolding>): CoinHolding {
  return {
    id: over.id ?? "c1",
    name: "비트코인",
    quantity: 1,
    buyPrice: 1000,
    currentPrice: 1000,
    sortOrder: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("buildCoinVM", () => {
  it("빈 입력은 0 합계를 낸다", () => {
    const vm = buildCoinVM([]);
    expect(vm.totalValueKrw).toBe(0);
    expect(vm.count).toBe(0);
    expect(vm.holdings).toEqual([]);
  });

  it("수량×단가로 손익을 계산하고 손실도 반영한다", () => {
    const vm = buildCoinVM([
      c({ quantity: 0.02, buyPrice: 160598977, currentPrice: 84699700 }),
    ]);
    expect(vm.totalCostKrw).toBeCloseTo(0.02 * 160598977, 2);
    expect(vm.totalValueKrw).toBeCloseTo(0.02 * 84699700, 2);
    expect(vm.totalPnlKrw).toBeLessThan(0);
    expect(vm.returnPct).toBeLessThan(0);
  });

  it("종목별 비중을 계산하고 sortOrder로 정렬한다", () => {
    const vm = buildCoinVM([
      c({ id: "eth", name: "이더리움", quantity: 1, buyPrice: 100, currentPrice: 100, sortOrder: 1 }),
      c({ id: "btc", name: "비트코인", quantity: 1, buyPrice: 100, currentPrice: 300, sortOrder: 0 }),
    ]);
    expect(vm.holdings.map((h) => h.id)).toEqual(["btc", "eth"]);
    // value: btc 300, eth 100 → 75% / 25%
    expect(vm.holdings.find((h) => h.id === "btc")?.pct).toBe(75);
    expect(vm.holdings.find((h) => h.id === "eth")?.pct).toBe(25);
  });
});
