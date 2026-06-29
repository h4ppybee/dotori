import { describe, it, expect } from "vitest";
import { buildSavingsVM, toKrw, SAVINGS_CATEGORIES } from "@/lib/savings/savings-service";
import type { SavingsAccount } from "@/lib/types";

function a(over: Partial<SavingsAccount>): SavingsAccount {
  return {
    id: over.id ?? "s1",
    category: "DEPOSIT",
    name: "계좌",
    amount: 1000,
    sortOrder: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("toKrw", () => {
  it("KRW(또는 통화 미지정)는 환율 무시하고 그대로 반환한다", () => {
    expect(toKrw(a({ amount: 5000 }))).toBe(5000);
    expect(toKrw(a({ amount: 5000, currency: "KRW" }), 1500)).toBe(5000);
  });

  it("USD는 환율을 곱한다", () => {
    expect(toKrw(a({ amount: 100, currency: "USD" }), 1500)).toBe(150000);
  });

  it("USD인데 환율이 없으면 0으로 환산한다", () => {
    expect(toKrw(a({ amount: 100, currency: "USD" }))).toBe(0);
  });
});

describe("buildSavingsVM", () => {
  it("빈 입력은 0 합계와 빈 목록을 낸다", () => {
    const vm = buildSavingsVM([]);
    expect(vm.totalKrw).toBe(0);
    expect(vm.count).toBe(0);
    expect(vm.byCategory).toEqual([]);
    expect(vm.groups).toEqual([]);
  });

  it("총액과 카테고리 비율을 계산한다", () => {
    const vm = buildSavingsVM([
      a({ id: "1", category: "DEPOSIT", amount: 600 }),
      a({ id: "2", category: "CHECKING", amount: 400 }),
    ]);
    expect(vm.totalKrw).toBe(1000);
    expect(vm.count).toBe(2);
    const dep = vm.byCategory.find((c) => c.category === "DEPOSIT");
    const chk = vm.byCategory.find((c) => c.category === "CHECKING");
    expect(dep?.pct).toBe(60);
    expect(chk?.pct).toBe(40);
  });

  it("총액 0이면 비율은 0으로 처리한다(0 나눗셈 방지)", () => {
    const vm = buildSavingsVM([a({ amount: 0 })]);
    expect(vm.totalKrw).toBe(0);
    // 금액 0 카테고리는 byCategory에서 제외된다
    expect(vm.byCategory).toEqual([]);
  });

  it("월 불입액 합계를 계산한다", () => {
    const vm = buildSavingsVM([
      a({ id: "1", monthlyDeposit: 700000 }),
      a({ id: "2", monthlyDeposit: 200000 }),
      a({ id: "3" }),
    ]);
    expect(vm.monthlyDepositTotal).toBe(900000);
  });

  it("카테고리는 고정 순서, 내부는 sortOrder 오름차순으로 정렬한다", () => {
    const vm = buildSavingsVM([
      a({ id: "etc", category: "ETC", amount: 10 }),
      a({ id: "dep2", category: "DEPOSIT", amount: 10, sortOrder: 2 }),
      a({ id: "dep1", category: "DEPOSIT", amount: 10, sortOrder: 1 }),
    ]);
    expect(vm.groups.map((g) => g.category)).toEqual(["DEPOSIT", "ETC"]);
    expect(vm.groups[0].accounts.map((x) => x.id)).toEqual(["dep1", "dep2"]);
  });

  it("USD 항목을 환율로 환산해 합산한다", () => {
    const vm = buildSavingsVM(
      [
        a({ id: "krw", category: "ETC", amount: 1000, currency: "KRW" }),
        a({ id: "usd", category: "ETC", amount: 100, currency: "USD" }),
      ],
      1500,
    );
    // 1000 + 100*1500 = 151000
    expect(vm.totalKrw).toBe(151000);
    const usdView = vm.groups[0].accounts.find((x) => x.id === "usd");
    expect(usdView?.amountKrw).toBe(150000);
  });

  it("환율이 없으면 USD 환산금은 0이지만 원본 amount는 보존한다", () => {
    const vm = buildSavingsVM([
      a({ id: "usd", category: "ETC", amount: 100, currency: "USD" }),
    ]);
    expect(vm.totalKrw).toBe(0);
    const usdView = vm.groups[0].accounts.find((x) => x.id === "usd");
    expect(usdView?.amountKrw).toBe(0);
    expect(usdView?.amount).toBe(100);
  });

  it("SAVINGS_CATEGORIES는 4종 고정이다", () => {
    expect(SAVINGS_CATEGORIES.map((c) => c.key)).toEqual([
      "DEPOSIT",
      "CHECKING",
      "BOND",
      "ETC",
    ]);
  });
});
