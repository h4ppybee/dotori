import { describe, it, expect } from "vitest";
import { computeNetWorth } from "@/lib/portfolio/net-worth";

describe("computeNetWorth", () => {
  it("splits total assets into net worth and debt shares", () => {
    const out = computeNetWorth(10_000, 2_000);
    expect(out).toEqual({
      totalAssets: 10_000,
      debt: 2_000,
      netWorth: 8_000,
      netWorthPct: 80,
      debtPct: 20,
    });
  });

  it("is 100% net worth when there is no debt", () => {
    const out = computeNetWorth(10_000, 0);
    expect(out.netWorth).toBe(10_000);
    expect(out.netWorthPct).toBe(100);
    expect(out.debtPct).toBe(0);
  });

  it("pcts sum to ~100 when net worth is positive", () => {
    const out = computeNetWorth(7, 3);
    expect(out.netWorthPct + out.debtPct).toBeCloseTo(100, 6);
  });

  it("clamps to 0% net worth / 100% debt when debt exceeds assets", () => {
    const out = computeNetWorth(1_000, 3_000);
    expect(out.netWorth).toBe(-2_000); // 음수 순자산은 값 그대로 보존(가운데 표시용)
    expect(out.netWorthPct).toBe(0);
    expect(out.debtPct).toBe(100);
  });

  it("returns zero shares when there are no assets", () => {
    expect(computeNetWorth(0, 0)).toEqual({
      totalAssets: 0,
      debt: 0,
      netWorth: 0,
      netWorthPct: 0,
      debtPct: 0,
    });
    // 자산 0인데 부채만 있으면 순자산은 음수지만 조각은 0(카드 자체가 노출 안 됨)
    const debtOnly = computeNetWorth(0, 500);
    expect(debtOnly.netWorth).toBe(-500);
    expect(debtOnly.netWorthPct).toBe(0);
    expect(debtOnly.debtPct).toBe(0);
  });
});
