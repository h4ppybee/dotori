import { describe, it, expect } from "vitest";
import { buildDebtVM, debtCategoryLabel } from "@/lib/debt/debt-service";
import type { LoanAccount } from "@/lib/types";

function loan(over: Partial<LoanAccount>): LoanAccount {
  return {
    id: "1", category: "ETC", name: "대출", balance: 0,
    sortOrder: 0, updatedAt: 0, ...over,
  };
}

describe("buildDebtVM", () => {
  it("빈 목록이면 총액 0", () => {
    const vm = buildDebtVM([]);
    expect(vm.totalKrw).toBe(0);
    expect(vm.items).toEqual([]);
  });

  it("잔액을 합산한다", () => {
    const vm = buildDebtVM([
      loan({ id: "a", balance: 120_000_000 }),
      loan({ id: "b", balance: 5_000_000 }),
    ]);
    expect(vm.totalKrw).toBe(125_000_000);
    expect(vm.items).toHaveLength(2);
  });

  it("sortOrder 오름차순으로 정렬한다", () => {
    const vm = buildDebtVM([
      loan({ id: "a", sortOrder: 2 }),
      loan({ id: "b", sortOrder: 0 }),
      loan({ id: "c", sortOrder: 1 }),
    ]);
    expect(vm.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("카테고리 한글 라벨을 반환한다", () => {
    expect(debtCategoryLabel("MORTGAGE")).toBe("주택담보");
    expect(debtCategoryLabel("JEONSE")).toBe("전세자금");
  });
});
