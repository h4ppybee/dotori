import { describe, it, expect } from "vitest";
import { accrueDeposit, depositPayDay } from "@/lib/savings/deposit-accrual";
import type { SavingsAccount } from "@/lib/types";

const base: SavingsAccount = {
  id: "d1",
  category: "DEPOSIT",
  name: "적금",
  amount: 1_000_000,
  monthlyDeposit: 100_000,
  maturityDate: "2027-07-24",
  balanceAsOf: "2026-08-10",
  sortOrder: 0,
  updatedAt: 0,
  source: "MANUAL",
};

describe("depositPayDay", () => {
  it("만기일 다음 날의 일자를 납입일로 쓴다", () => {
    expect(depositPayDay("2027-07-24")).toBe(25);
  });
  it("만기일이 말일이면 1일", () => {
    expect(depositPayDay("2027-06-30")).toBe(1);
    expect(depositPayDay("2028-02-29")).toBe(1);
    expect(depositPayDay("2027-02-28")).toBe(1);
  });
  it("형식이 잘못되면 null", () => {
    expect(depositPayDay("")).toBeNull();
    expect(depositPayDay("2027-7-1")).toBeNull();
  });
});

describe("accrueDeposit", () => {
  it("대상이 아니면 null", () => {
    expect(accrueDeposit({ ...base, category: "CHECKING" }, "2026-10-14")).toBeNull();
    expect(accrueDeposit({ ...base, source: "AUTO" }, "2026-10-14")).toBeNull();
    expect(accrueDeposit({ ...base, monthlyDeposit: 0 }, "2026-10-14")).toBeNull();
    expect(accrueDeposit({ ...base, monthlyDeposit: undefined }, "2026-10-14")).toBeNull();
    expect(accrueDeposit({ ...base, maturityDate: undefined }, "2026-10-14")).toBeNull();
    expect(accrueDeposit({ ...base, currency: "USD" }, "2026-10-14")).toBeNull();
  });

  it("기준일이 없으면 소급하지 않고 기준일만 오늘로 초기화한다", () => {
    expect(accrueDeposit({ ...base, balanceAsOf: undefined }, "2026-10-14")).toEqual({
      amount: 1_000_000,
      balanceAsOf: "2026-10-14",
    });
  });

  it("기준일이 오늘 이후거나 같으면 null", () => {
    expect(accrueDeposit({ ...base, balanceAsOf: "2026-10-14" }, "2026-10-14")).toBeNull();
    expect(accrueDeposit({ ...base, balanceAsOf: "2026-10-20" }, "2026-10-14")).toBeNull();
  });

  it("지난 납입일 수만큼 월 불입액을 더한다 (08-25, 09-25)", () => {
    expect(accrueDeposit(base, "2026-10-14")).toEqual({
      amount: 1_200_000,
      balanceAsOf: "2026-10-14",
    });
  });

  it("오늘이 납입일이면 오늘 포함", () => {
    expect(accrueDeposit(base, "2026-08-25")?.amount).toBe(1_100_000);
  });

  it("기준일 당일 납입일은 제외한다", () => {
    expect(accrueDeposit({ ...base, balanceAsOf: "2026-08-25" }, "2026-09-24")).toEqual({
      amount: 1_000_000,
      balanceAsOf: "2026-09-24",
    });
  });

  it("해를 넘겨 계산한다", () => {
    // 2026-11-25, 12-25, 2027-01-25, 02-25
    expect(accrueDeposit({ ...base, balanceAsOf: "2026-11-01" }, "2027-03-01")?.amount).toBe(1_400_000);
  });

  it("납입일이 그 달에 없으면 말일로 보정한다", () => {
    // 만기 2027-03-30 → 납입일 31일. 2027-02는 28일로 보정.
    const acc = { ...base, maturityDate: "2027-03-30", balanceAsOf: "2027-01-31" };
    expect(accrueDeposit(acc, "2027-02-27")?.amount).toBe(1_000_000);
    expect(accrueDeposit(acc, "2027-02-28")?.amount).toBe(1_100_000);
  });

  it("만기일이 말일이면 매월 1일에 증가한다", () => {
    const acc = { ...base, maturityDate: "2027-06-30", balanceAsOf: "2026-10-01" };
    expect(accrueDeposit(acc, "2026-12-01")?.amount).toBe(1_200_000);
  });

  it("만기 이후에는 증가하지 않는다", () => {
    // 만기 2027-07-24 → 마지막 납입 2027-06-25
    const acc = { ...base, balanceAsOf: "2027-06-01" };
    expect(accrueDeposit(acc, "2027-12-31")).toEqual({
      amount: 1_100_000,
      balanceAsOf: "2027-12-31",
    });
  });
});
