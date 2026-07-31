import { describe, it, expect } from "vitest";
import { buildGoalProgress } from "@/lib/goal/goal-service";

const base = { currentNetWorthKrw: 5_000_000, targetNetWorthKrw: 10_000_000, targetDate: "2026-12-31", todayIso: "2026-07-10" };

describe("buildGoalProgress", () => {
  it("남은 금액·진행률을 계산한다", () => {
    const r = buildGoalProgress(base);
    expect(r.remainingKrw).toBe(5_000_000);
    expect(r.progressPct).toBe(50);
    expect(r.status).toBe("active");
  });

  it("월 적립액 = 남은금액 ÷ 남은개월(올림)", () => {
    // 2026-07-10 → 2026-12-31: base=5, d 31>10 → 6개월. ceil(5,000,000/6)=833,334
    const r = buildGoalProgress(base);
    expect(r.monthsRemaining).toBe(6);
    expect(r.monthlyRequiredKrw).toBe(833_334);
  });

  it.each([
    ["2026-07-10", "2026-09-10", 2],
    ["2026-07-10", "2026-09-20", 3],
    ["2026-07-31", "2026-09-01", 2],
    ["2026-07-10", "2026-07-20", 1],
  ])("monthsRemaining(%s→%s)=%i", (todayIso, targetDate, months) => {
    const r = buildGoalProgress({ ...base, todayIso, targetDate, currentNetWorthKrw: 0 });
    expect(r.monthsRemaining).toBe(months);
  });

  it("current ≥ target 이면 achieved", () => {
    const r = buildGoalProgress({ ...base, currentNetWorthKrw: 12_000_000 });
    expect(r.status).toBe("achieved");
    expect(r.remainingKrw).toBe(0);
  });

  it("목표일이 과거이면 overdue, monthsRemaining=0, 월적립=남은전액", () => {
    const r = buildGoalProgress({ ...base, targetDate: "2026-07-05" });
    expect(r.status).toBe("overdue");
    expect(r.monthsRemaining).toBe(0);
    expect(r.monthlyRequiredKrw).toBe(5_000_000);
  });

  it("targetDate 파싱 불가 → overdue 처리", () => {
    const r = buildGoalProgress({ ...base, targetDate: "" });
    expect(r.status).toBe("overdue");
    expect(r.monthsRemaining).toBe(0);
  });

  it("current 음수여도 진행률은 음수 그대로(표시 측 클램프)", () => {
    const r = buildGoalProgress({ ...base, currentNetWorthKrw: -1_000_000 });
    expect(r.progressPct).toBeLessThan(0);
    expect(r.remainingKrw).toBe(11_000_000);
  });

  it("target ≤ 0 이면 progressPct=0", () => {
    const r = buildGoalProgress({ ...base, targetNetWorthKrw: 0, currentNetWorthKrw: 0 });
    expect(r.progressPct).toBe(0);
  });
});
