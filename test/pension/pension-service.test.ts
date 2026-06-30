import { describe, it, expect } from "vitest";
import { buildPensionVM, PENSION_CATEGORIES } from "@/lib/pension/pension-service";
import type { PensionAccount } from "@/lib/types";

function p(over: Partial<PensionAccount>): PensionAccount {
  return {
    id: over.id ?? "p1",
    category: "PERSONAL",
    name: "TIGER 미국S&P500",
    quantity: 1,
    buyPrice: 1000,
    currentPrice: 1000,
    sortOrder: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("buildPensionVM", () => {
  it("빈 입력은 0 합계를 낸다", () => {
    const vm = buildPensionVM([]);
    expect(vm.totalValueKrw).toBe(0);
    expect(vm.totalCostKrw).toBe(0);
    expect(vm.count).toBe(0);
    expect(vm.byCategory).toEqual([]);
  });

  it("수량×단가로 평가금·원금·손익·수익률을 계산한다", () => {
    const vm = buildPensionVM([
      p({ quantity: 244, buyPrice: 24567, currentPrice: 26160 }),
    ]);
    expect(vm.totalCostKrw).toBe(244 * 24567);
    expect(vm.totalValueKrw).toBe(244 * 26160);
    expect(vm.totalPnlKrw).toBe(244 * 26160 - 244 * 24567);
    expect(vm.returnPct).toBeCloseTo(((26160 - 24567) / 24567) * 100, 4);
  });

  it("카테고리별 비중과 그룹을 만든다(고정 순서)", () => {
    const vm = buildPensionVM([
      p({ id: "ret", category: "RETIREMENT", quantity: 1, buyPrice: 100, currentPrice: 100 }),
      p({ id: "per", category: "PERSONAL", quantity: 1, buyPrice: 100, currentPrice: 300 }),
    ]);
    expect(vm.groups.map((g) => g.category)).toEqual(["PERSONAL", "RETIREMENT"]);
    const per = vm.byCategory.find((c) => c.category === "PERSONAL");
    const ret = vm.byCategory.find((c) => c.category === "RETIREMENT");
    // value: PERSONAL 300, RETIREMENT 100 → 75% / 25%
    expect(per?.pct).toBe(75);
    expect(ret?.pct).toBe(25);
  });

  it("원금 0이면 수익률은 0으로 처리한다", () => {
    const vm = buildPensionVM([p({ quantity: 1, buyPrice: 0, currentPrice: 100 })]);
    expect(vm.returnPct).toBe(0);
  });

  it("PENSION_CATEGORIES는 개인/퇴직 2종 고정이다", () => {
    expect(PENSION_CATEGORIES.map((c) => c.key)).toEqual(["PERSONAL", "RETIREMENT"]);
  });
});
